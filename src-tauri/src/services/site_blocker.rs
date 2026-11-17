//! 系统级网站屏蔽：在 hosts 文件里写入一段带标记的屏蔽区块。
//! 平台细节（提权、DNS 刷新）在 crate::platform 中。

use crate::errors::AppError;
use crate::platform;

const BLOCK_START: &str = "# === POMODORO FOCUS BLOCK START ===";
const BLOCK_END: &str = "# === POMODORO FOCUS BLOCK END ===";

/// 把用户输入（可能带协议、路径、端口）清洗成纯域名。
pub fn clean_domain(site: &str) -> String {
    let s = site.trim().to_lowercase();
    let s = s
        .strip_prefix("https://")
        .or_else(|| s.strip_prefix("http://"))
        .unwrap_or(&s);
    let host = s.split('/').next().unwrap_or("");
    host.split(':').next().unwrap_or("").trim_matches('.').to_string()
}

/// 清洗并补全 www / 裸域名两个变体，去重保序。
pub fn expand_domains(sites: &[String]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |d: String| {
        if !d.is_empty() && !out.contains(&d) {
            out.push(d);
        }
    };
    for site in sites {
        let d = clean_domain(site);
        if d.is_empty() {
            continue;
        }
        let variant = match d.strip_prefix("www.") {
            Some(bare) => bare.to_string(),
            None => format!("www.{}", d),
        };
        push(d);
        push(variant);
    }
    out
}

/// 去掉 hosts 中我们写入的区块。
pub fn strip_block(content: &str) -> String {
    // 只有 START 没有 END（被手动改坏）时，只删掉 START 这一行，不要吞掉后面的内容
    let has_end_after_start = content
        .find(BLOCK_START)
        .is_some_and(|i| content[i..].contains(BLOCK_END));
    let mut lines = Vec::new();
    let mut inside = false;
    for line in content.lines() {
        if line.contains(BLOCK_START) {
            inside = has_end_after_start;
        } else if line.contains(BLOCK_END) {
            inside = false;
        } else if !inside {
            lines.push(line);
        }
    }
    let mut result = lines.join(platform::LINE_ENDING);
    result.push_str(platform::LINE_ENDING);
    result
}

/// 生成带屏蔽区块的 hosts 内容。
pub fn with_block(content: &str, domains: &[String]) -> String {
    let nl = platform::LINE_ENDING;
    let mut out = strip_block(content);
    out.push_str(BLOCK_START);
    out.push_str(nl);
    for d in domains {
        out.push_str(&format!("0.0.0.0 {d}{nl}::1 {d}{nl}"));
    }
    out.push_str(BLOCK_END);
    out.push_str(nl);
    out
}

pub fn is_blocking_active() -> bool {
    platform::read_hosts()
        .map(|c| c.contains(BLOCK_START))
        .unwrap_or(false)
}

/// 屏蔽网站（会请求一次管理员权限）。
static HOSTS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn hosts_lock() -> std::sync::MutexGuard<'static, ()> {
    HOSTS_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn block_sites(sites: &[String]) -> Result<(), AppError> {
    let _guard = hosts_lock();
    let domains = expand_domains(sites);
    if domains.is_empty() {
        return Ok(());
    }
    let current = platform::read_hosts()
        .map_err(|e| AppError::IoError(format!("读取 hosts 失败: {}", e)))?;
    platform::write_hosts_elevated(&with_block(&current, &domains))
}

/// 解除屏蔽；hosts 中没有我们的区块时什么都不做。
pub fn unblock_sites() -> Result<(), AppError> {
    let _guard = hosts_lock();
    let current = match platform::read_hosts() {
        Ok(c) => c,
        Err(_) => return Ok(()),
    };
    if !current.contains(BLOCK_START) {
        return Ok(());
    }
    platform::restore_hosts(&strip_block(&current))
}

/// 后台线程解除屏蔽，不阻塞 UI。
pub fn unblock_sites_async() {
    std::thread::spawn(|| {
        if let Err(e) = unblock_sites() {
            log::warn!("解除网站屏蔽失败: {}", e);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_urls() {
        assert_eq!(clean_domain("https://www.Bilibili.com/video/1"), "www.bilibili.com");
        assert_eq!(clean_domain("douyin.com:443"), "douyin.com");
        assert_eq!(clean_domain("  "), "");
    }

    #[test]
    fn expands_www_variants() {
        let d = expand_domains(&["bilibili.com".into(), "www.bilibili.com".into(), "https://x.com/".into()]);
        assert_eq!(d, vec!["bilibili.com", "www.bilibili.com", "x.com", "www.x.com"]);
    }

    #[test]
    fn block_round_trip_restores_original() {
        let nl = platform::LINE_ENDING;
        let original = format!("127.0.0.1 localhost{nl}::1 localhost{nl}");
        let blocked = with_block(&original, &["a.com".into()]);
        assert!(blocked.contains("0.0.0.0 a.com"));
        assert_eq!(strip_block(&blocked), original);
        // 重复屏蔽不会叠加区块
        let twice = with_block(&blocked, &["a.com".into()]);
        assert_eq!(twice.matches(BLOCK_START).count(), 1);
    }

    #[test]
    fn broken_block_keeps_following_lines() {
        let nl = platform::LINE_ENDING;
        let broken = format!("a{nl}{BLOCK_START}{nl}b{nl}c{nl}");
        assert_eq!(strip_block(&broken), format!("a{nl}b{nl}c{nl}"));
    }
}
