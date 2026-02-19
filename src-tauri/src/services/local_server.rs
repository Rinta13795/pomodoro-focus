use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tiny_http::{Response, Server};

use crate::models::Config;

const DEFAULT_PORT: u16 = 27190;

/// 共享状态，供 HTTP 服务读取
pub struct ServerState {
    pub timer_running: Arc<AtomicBool>,
    pub config: Arc<Mutex<Config>>,
}

pub struct LocalServer;

impl LocalServer {
    /// 启动 HTTP 服务（在单独线程中运行）
    pub fn start(state: Arc<ServerState>) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            Self::run_server(state);
        })
    }

    fn run_server(state: Arc<ServerState>) {
        let addr = format!("127.0.0.1:{}", DEFAULT_PORT);
        let server = match Server::http(&addr) {
            Ok(s) => {
                println!("[LocalServer] HTTP 服务启动: {}", addr);
                s
            }
            Err(e) => {
                eprintln!("[LocalServer] 启动失败: {}", e);
                return;
            }
        };

        for request in server.incoming_requests() {
            let response = Self::handle_request(&state, &request);
            let _ = request.respond(response);
        }
    }

    fn handle_request(
        state: &Arc<ServerState>,
        request: &tiny_http::Request,
    ) -> Response<std::io::Cursor<Vec<u8>>> {
        let path = request.url();

        // CORS 预检请求
        if request.method() == &tiny_http::Method::Options {
            return Self::cors_response("");
        }

        match path {
            "/status" => Self::handle_status(state),
            _ => Self::not_found_response(),
        }
    }

    fn handle_status(state: &Arc<ServerState>) -> Response<std::io::Cursor<Vec<u8>>> {
        let focusing = state.timer_running.load(Ordering::SeqCst);
        let raw_sites = {
            let config = state.config.lock().unwrap();
            config.blocked_sites.clone()
        };

        // 提取纯域名，并自动补充 www 前缀版本
        let mut blocked_sites: Vec<String> = Vec::new();
        for site in &raw_sites {
            let hostname = Self::extract_hostname(site);
            if !hostname.is_empty() && !blocked_sites.contains(&hostname) {
                blocked_sites.push(hostname.clone());
            }
            // 自动补充 www 前缀版本
            let www_variant = if hostname.starts_with("www.") {
                hostname.trim_start_matches("www.").to_string()
            } else {
                format!("www.{}", hostname)
            };
            if !blocked_sites.contains(&www_variant) {
                blocked_sites.push(www_variant);
            }
        }

        let json = serde_json::json!({
            "focusing": focusing,
            "blocked_sites": blocked_sites
        });

        Self::cors_response(&json.to_string())
    }

    /// 从 URL 或域名字符串中提取纯域名
    fn extract_hostname(site: &str) -> String {
        let s = site.trim().trim_end_matches('/');
        if s.starts_with("http://") || s.starts_with("https://") {
            // 用简单解析提取 host 部分
            if let Some(after_scheme) = s.split("://").nth(1) {
                let host = after_scheme.split('/').next().unwrap_or("");
                // 去掉端口号
                host.split(':').next().unwrap_or("").to_string()
            } else {
                s.to_string()
            }
        } else {
            // 已经是纯域名，去掉可能的路径和端口
            let host = s.split('/').next().unwrap_or(s);
            host.split(':').next().unwrap_or(host).to_string()
        }
    }

    fn cors_response(body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
        let data = body.as_bytes().to_vec();
        Response::from_data(data)
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Access-Control-Allow-Origin"[..],
                    &b"*"[..],
                ).unwrap(),
            )
            .with_header(
                tiny_http::Header::from_bytes(
                    &b"Content-Type"[..],
                    &b"application/json"[..],
                ).unwrap(),
            )
    }

    fn not_found_response() -> Response<std::io::Cursor<Vec<u8>>> {
        let body = r#"{"error": "Not Found"}"#;
        Response::from_data(body.as_bytes().to_vec())
            .with_status_code(404)
    }
}