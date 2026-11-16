//! 平台相关代码集中在这里。其它模块只调用本模块暴露的函数，
//! 不直接出现 osascript / pfctl / PowerShell 之类的系统细节。

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod other;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use other::*;

/// 常见 App 的显示名 → 进程名别名（不区分大小写，不含 .exe）。
/// 用户在黑名单里写中文名时也能匹配到真实进程。
pub const APP_ALIASES: &[(&str, &[&str])] = &[
    ("微信", &["wechat", "weixin"]),
    ("qq", &["qq", "qqnt"]),
    ("哔哩哔哩", &["bilibili", "哔哩哔哩"]),
    ("bilibili", &["bilibili", "哔哩哔哩"]),
    ("抖音", &["douyin"]),
    ("网易云音乐", &["cloudmusic", "neteasemusic"]),
    ("steam", &["steam", "steamwebhelper"]),
    ("wegame", &["wegame"]),
    ("英雄联盟", &["leagueclient", "league of legends"]),
    ("原神", &["yuanshen", "genshinimpact"]),
];

/// 返回某个黑名单条目可能对应的所有进程名（小写、无 .exe 后缀）。
pub fn process_name_candidates(app: &str) -> Vec<String> {
    let lower = app.trim().to_lowercase();
    let mut names = vec![lower.trim_end_matches(".exe").to_string()];
    for (alias, procs) in APP_ALIASES {
        if *alias == lower {
            names.extend(procs.iter().map(|p| p.to_string()));
        }
    }
    if let Some(exec) = resolve_executable_name(app) {
        names.push(exec.to_lowercase().trim_end_matches(".exe").to_string());
    }
    names.sort();
    names.dedup();
    names
}

/// 统一进程名：小写并去掉 Windows 的 .exe 后缀。
pub fn normalize_process_name(name: &str) -> String {
    let lower = name.to_lowercase();
    lower.trim_end_matches(".exe").to_string()
}

/// 解析域名的 IPv4 地址（跳过本地回环和 0.0.0.0，防止读到我们自己写进 hosts 的记录）。
pub fn resolve_ipv4(domain: &str) -> Vec<std::net::Ipv4Addr> {
    use std::net::{IpAddr, ToSocketAddrs};
    let mut ips: Vec<std::net::Ipv4Addr> = (domain, 443)
        .to_socket_addrs()
        .map(|addrs| {
            addrs
                .filter_map(|a| match a.ip() {
                    IpAddr::V4(v4) if !v4.is_loopback() && !v4.is_unspecified() => Some(v4),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    ips.sort();
    ips.dedup();
    ips
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_exe_suffix() {
        assert_eq!(normalize_process_name("WeChat.exe"), "wechat");
        assert_eq!(normalize_process_name("QQ"), "qq");
    }

    #[test]
    fn alias_candidates_include_process_names() {
        let c = process_name_candidates("微信");
        assert!(c.contains(&"wechat".to_string()));
        assert!(c.contains(&"微信".to_string()));
    }
}
