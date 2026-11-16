//! 本地 HTTP 服务（127.0.0.1:27190），供浏览器扩展轮询专注状态。

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tiny_http::{Header, Method, Response, Server};

use crate::models::Config;
use crate::services::site_blocker::expand_domains;

pub const PORT: u16 = 27190;

pub struct ServerState {
    pub timer_running: Arc<AtomicBool>,
    pub config: Arc<Mutex<Config>>,
}

pub fn start(state: ServerState) {
    thread::spawn(move || {
        let server = match Server::http(("127.0.0.1", PORT)) {
            Ok(s) => s,
            Err(e) => {
                log::error!("本地服务启动失败（端口 {} 被占用？）: {}", PORT, e);
                return;
            }
        };
        for request in server.incoming_requests() {
            let response = if request.method() == &Method::Options {
                json_response(String::new(), 204)
            } else if request.url() == "/status" {
                json_response(status_json(&state), 200)
            } else {
                json_response(r#"{"error":"Not Found"}"#.to_string(), 404)
            };
            let _ = request.respond(response);
        }
    });
}

fn status_json(state: &ServerState) -> String {
    let sites = state.config.lock().unwrap().blocked_sites.clone();
    serde_json::json!({
        "focusing": state.timer_running.load(Ordering::SeqCst),
        "blocked_sites": expand_domains(&sites),
    })
    .to_string()
}

fn json_response(body: String, code: u16) -> Response<Cursor<Vec<u8>>> {
    let header = |k: &str, v: &str| Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
    Response::from_data(body.into_bytes())
        .with_status_code(code)
        .with_header(header("Content-Type", "application/json"))
        .with_header(header("Access-Control-Allow-Origin", "*"))
}
