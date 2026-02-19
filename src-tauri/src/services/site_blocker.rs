use crate::errors::AppError;
use crate::models::Config;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const HOSTS_PATH: &str = "/etc/hosts";
const BLOCK_MARKER_START: &str = "# === POMODORO FOCUS BLOCK START ===";
const BLOCK_MARKER_END: &str = "# === POMODORO FOCUS BLOCK END ===";
const PF_ANCHOR_NAME: &str = "pomodoro-focus";
const PF_RULES_PATH: &str = "/tmp/pomodoro_pf_rules.conf";

pub struct SiteBlocker {
    blocked_sites: Vec<String>,
}

impl SiteBlocker {
    pub fn new(blocked_sites: Vec<String>) -> Self {
        SiteBlocker { blocked_sites }
    }

    pub fn update_blocked_sites(&mut self, sites: Vec<String>) {
        self.blocked_sites = sites;
    }

    pub fn get_blocked_sites(&self) -> &Vec<String> {
        &self.blocked_sites
    }

    /// 清理域名：去掉协议前缀和末尾斜杠，只保留纯域名
    fn clean_domain(site: &str) -> String {
        let mut domain = site.trim().to_string();

        // 去掉协议前缀
        if domain.starts_with("https://") {
            domain = domain[8..].to_string();
        } else if domain.starts_with("http://") {
            domain = domain[7..].to_string();
        }

        // 去掉末尾斜杠
        while domain.ends_with('/') {
            domain.pop();
        }

        // 去掉路径部分，只保留域名
        if let Some(pos) = domain.find('/') {
            domain = domain[..pos].to_string();
        }

        domain.to_lowercase()
    }

    /// 使用 dig 命令解析域名获取 IP 地址
    fn resolve_domain_ips(domain: &str) -> Vec<String> {
        let output = Command::new("dig")
            .args(["+short", domain])
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout
                    .lines()
                    .filter(|line| {
                        // 只保留 IPv4 地址
                        line.parse::<std::net::Ipv4Addr>().is_ok()
                    })
                    .map(|s| s.to_string())
                    .collect()
            }
            Err(e) => {
                println!("[SiteBlocker] dig 解析 {} 失败: {}", domain, e);
                Vec::new()
            }
        }
    }

    /// 生成 pf 规则文件内容
    fn generate_pf_rules(ips: &HashSet<String>) -> String {
        let mut rules = String::new();
        rules.push_str("# Pomodoro Focus - Site Blocking Rules\n");

        for ip in ips {
            rules.push_str(&format!(
                "block drop out proto tcp from any to {} port {{80, 443}}\n",
                ip
            ));
        }

        rules
    }

    /// 屏蔽网站（使用 pf 防火墙 + hosts 双保险，一次授权）
    pub fn block_sites(&self) -> Result<(), AppError> {
        if self.blocked_sites.is_empty() {
            return Ok(());
        }

        println!("[SiteBlocker] 开始屏蔽网站...");

        // 收集所有需要屏蔽的 IP 和域名
        let mut all_ips: HashSet<String> = HashSet::new();
        let mut clean_domains: Vec<String> = Vec::new();

        for site in &self.blocked_sites {
            let clean_site = Self::clean_domain(site);
            if clean_site.is_empty() {
                continue;
            }
            clean_domains.push(clean_site.clone());
            // 自动添加 www 变体
            if clean_site.starts_with("www.") {
                let bare = clean_site[4..].to_string();
                if !clean_domains.contains(&bare) {
                    clean_domains.push(bare);
                }
            } else {
                let www = format!("www.{}", clean_site);
                if !clean_domains.contains(&www) {
                    clean_domains.push(www);
                }
            }

            // 解析域名获取 IP
            let ips = Self::resolve_domain_ips(&clean_site);
            println!("[SiteBlocker] {} -> {:?}", clean_site, ips);
            for ip in ips {
                all_ips.insert(ip);
            }
        }

        if clean_domains.is_empty() {
            return Ok(());
        }

        // 准备临时文件
        self.prepare_block_files(&clean_domains, &all_ips)?;

        // 一次性执行所有需要管理员权限的操作
        self.execute_block_commands()?;

        println!("[SiteBlocker] 网站屏蔽完成");
        Ok(())
    }

    /// 准备屏蔽所需的临时文件（hosts 和 pf 规则）
    fn prepare_block_files(
        &self,
        domains: &[String],
        ips: &HashSet<String>,
    ) -> Result<(), AppError> {
        // 1. 备份并准备 hosts 文件
        self.backup_hosts()?;

        let current_hosts = fs::read_to_string(HOSTS_PATH)
            .map_err(|e| AppError::IoError(format!("读取 hosts 失败: {}", e)))?;

        // 移除旧的屏蔽记录
        let clean_hosts = self.remove_block_section(&current_hosts);

        // 构建新的 hosts 内容
        let mut new_hosts = clean_hosts;
        new_hosts.push_str("\n");
        new_hosts.push_str(BLOCK_MARKER_START);
        new_hosts.push('\n');
        for domain in domains {
            new_hosts.push_str(&format!("0.0.0.0 {}\n", domain));
            new_hosts.push_str(&format!("127.0.0.1 {}\n", domain));
        }
        new_hosts.push_str(BLOCK_MARKER_END);
        new_hosts.push('\n');

        // 写入临时 hosts 文件
        fs::write("/tmp/pomodoro_hosts_temp", &new_hosts).map_err(|e| {
            AppError::IoError(format!("写入临时 hosts 文件失败: {}", e))
        })?;

        // 2. 准备 pf 规则文件
        if !ips.is_empty() {
            let rules = Self::generate_pf_rules(ips);
            fs::write(PF_RULES_PATH, &rules).map_err(|e| {
                AppError::IoError(format!("写入 pf 规则文件失败: {}", e))
            })?;
            println!("[SiteBlocker] pf 规则文件已生成");
        }

        Ok(())
    }

    /// 一次性执行所有需要管理员权限的屏蔽命令
    fn execute_block_commands(&self) -> Result<(), AppError> {
        // 合并所有 sudo 操作为一条命令，末尾 chmod 646 让 unblock 时无需 sudo
        let shell_cmd = format!(
            "cp /tmp/pomodoro_hosts_temp {} && \
             pfctl -a {} -f {} 2>/dev/null || true && \
             pfctl -e 2>/dev/null || true && \
             dscacheutil -flushcache && \
             killall -HUP mDNSResponder && \
             chmod 646 {}",
            HOSTS_PATH, PF_ANCHOR_NAME, PF_RULES_PATH, HOSTS_PATH
        );

        println!("[SiteBlocker] 执行合并命令（一次授权）");

        let applescript = format!(
            "do shell script \"{}\" with administrator privileges",
            shell_cmd
        );

        let output = Command::new("osascript")
            .arg("-e")
            .arg(&applescript)
            .output()
            .map_err(|e| {
                AppError::PermissionDenied(format!("请求管理员权限失败: {}", e))
            })?;

        // 清理临时文件
        let _ = fs::remove_file("/tmp/pomodoro_hosts_temp");

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if err.contains("User cancelled") || err.contains("(-128)") {
                return Err(AppError::PermissionDenied(
                    "用户取消了管理员权限授权".to_string(),
                ));
            }
            println!("[SiteBlocker] 命令执行警告: {}", err);
        } else {
            println!("[SiteBlocker] 屏蔽命令执行成功");
        }

        Ok(())
    }

    /// 恢复网站访问（清理 pf 规则和 hosts 记录，静默执行不弹密码框）
    pub fn unblock_sites(&self) -> Result<(), AppError> {
        println!("[SiteBlocker] 开始清理屏蔽规则...");

        // 读取并清理 hosts 内容
        let hosts_content = match fs::read_to_string(HOSTS_PATH) {
            Ok(content) => content,
            Err(_) => return Ok(()),
        };

        let need_clean_hosts = hosts_content.contains(BLOCK_MARKER_START);

        // 准备清理后的 hosts 文件
        if need_clean_hosts {
            let cleaned = self.remove_block_section(&hosts_content);
            fs::write("/tmp/pomodoro_hosts_clean", &cleaned).map_err(|e| {
                AppError::IoError(format!("写入临时文件失败: {}", e))
            })?;
        }

        // 一次性执行所有清理命令
        self.execute_unblock_commands(need_clean_hosts)?;

        println!("[SiteBlocker] 屏蔽规则清理完成");
        Ok(())
    }

    /// 一次性执行所有清理命令（无需 sudo，block 时已 chmod 646）
    fn execute_unblock_commands(&self, need_clean_hosts: bool) -> Result<(), AppError> {
        println!("[SiteBlocker] 执行清理命令（无需密码）");

        // 清理 pf 规则
        let pf_output = Command::new("pfctl")
            .args(["-a", PF_ANCHOR_NAME, "-F", "all"])
            .output();
        match pf_output {
            Ok(out) if out.status.success() => {
                println!("[SiteBlocker] pf 规则清理成功");
            }
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr);
                println!("[SiteBlocker] pf 清理警告（可忽略）: {}", err);
            }
            Err(e) => {
                println!("[SiteBlocker] pf 清理失败（可忽略）: {}", e);
            }
        }

        // 清理 hosts 文件（block 时已 chmod 646，可直接写入）
        if need_clean_hosts {
            match fs::copy("/tmp/pomodoro_hosts_clean", HOSTS_PATH) {
                Ok(_) => {
                    println!("[SiteBlocker] hosts 文件恢复成功");
                    // 恢复 hosts 权限为 644
                    let _ = Command::new("chmod").args(["644", HOSTS_PATH]).output();
                }
                Err(e) => {
                    println!("[SiteBlocker] hosts 恢复失败: {}", e);
                }
            }
        }

        // 刷新 DNS（不需要 sudo）
        let _ = Command::new("dscacheutil")
            .arg("-flushcache")
            .output();
        let _ = Command::new("killall")
            .args(["-HUP", "mDNSResponder"])
            .output();

        // 清理临时文件
        let _ = fs::remove_file("/tmp/pomodoro_hosts_clean");
        let _ = fs::remove_file(PF_RULES_PATH);

        println!("[SiteBlocker] 清理命令执行完成");
        Ok(())
    }

    /// 检查 hosts 文件中是否已有屏蔽记录
    pub fn is_blocking_active() -> bool {
        match fs::read_to_string(HOSTS_PATH) {
            Ok(content) => content.contains(BLOCK_MARKER_START),
            Err(_) => false,
        }
    }

    /// 启动时检查并清理残留的屏蔽记录
    pub fn cleanup_if_needed() -> Result<(), AppError> {
        println!("[SiteBlocker] 检查残留屏蔽规则...");

        let blocker = SiteBlocker::new(Vec::new());

        // 直接调用 unblock_sites 清理所有残留
        blocker.unblock_sites()?;

        println!("[SiteBlocker] 残留规则检查完成");
        Ok(())
    }

    /// 备份 hosts 文件
    fn backup_hosts(&self) -> Result<(), AppError> {
        let backup_path = Self::backup_path()?;

        // 确保目录存在
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                AppError::IoError(format!("创建备份目录失败: {}", e))
            })?;
        }

        // 读取原始 hosts
        let original_hosts = fs::read_to_string(HOSTS_PATH)
            .map_err(|e| AppError::IoError(format!("读取 hosts 文件失败: {}", e)))?;

        // 移除已有的屏蔽记录后再备份
        let clean_hosts = self.remove_block_section(&original_hosts);

        // 写入备份
        fs::write(&backup_path, clean_hosts)
            .map_err(|e| AppError::IoError(format!("写入备份文件失败: {}", e)))?;

        Ok(())
    }

    /// 获取备份文件路径
    fn backup_path() -> Result<PathBuf, AppError> {
        let config_dir = Config::config_dir()?;
        Ok(config_dir.join("hosts.backup"))
    }

    /// 移除屏蔽区块
    fn remove_block_section(&self, content: &str) -> String {
        let mut result = Vec::new();
        let mut in_block = false;

        for line in content.lines() {
            if line.contains(BLOCK_MARKER_START) {
                in_block = true;
                continue;
            }
            if line.contains(BLOCK_MARKER_END) {
                in_block = false;
                continue;
            }
            if !in_block {
                result.push(line);
            }
        }

        result.join("\n")
    }
}

impl Default for SiteBlocker {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}
