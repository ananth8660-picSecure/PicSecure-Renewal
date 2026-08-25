use serde::Deserialize;
use std::{
    collections::HashSet,
    sync::Mutex,
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_notification::NotificationExt;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reminder {
    id: String,
    title: String,
    body: String,
    at_epoch_ms: i64,
}

#[derive(Default)]
struct ReminderState {
    items: Mutex<Vec<Reminder>>,
    delivered: Mutex<HashSet<String>>,
}

#[tauri::command]
fn schedule_notifications(items: Vec<Reminder>, state: State<'_, ReminderState>) -> usize {
    let delivered = state.delivered.lock().expect("notification delivery state poisoned");
    let pending = items.iter().filter(|item| !delivered.contains(&item.id)).count();
    drop(delivered);
    *state.items.lock().expect("notification schedule state poisoned") = items;
    pending
}

#[tauri::command]
fn clear_notifications(state: State<'_, ReminderState>) {
    state.items.lock().expect("notification schedule state poisoned").clear();
    state.delivered.lock().expect("notification delivery state poisoned").clear();
}

fn start_notification_clock(app: AppHandle) {
    thread::spawn(move || loop {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default();
        let due = {
            let state = app.state::<ReminderState>();
            let items = state.items.lock().expect("notification schedule state poisoned");
            let delivered = state.delivered.lock().expect("notification delivery state poisoned");
            items
                .iter()
                .filter(|item| {
                    !delivered.contains(&item.id) && item.at_epoch_ms <= now
                })
                .cloned()
                .collect::<Vec<_>>()
        };
        for reminder in due {
            let _ = app
                .notification()
                .builder()
                .title(&reminder.title)
                .body(&reminder.body)
                .show();
            app.state::<ReminderState>()
                .delivered
                .lock()
                .expect("notification delivery state poisoned")
                .insert(reminder.id);
        }
        thread::sleep(Duration::from_secs(30));
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .manage(ReminderState::default())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().args(["--background"]).build())
        .invoke_handler(tauri::generate_handler![schedule_notifications, clear_notifications])
        .setup(|app| {
            let open = MenuItem::with_id(app, "open", "Open PicSecure Renew", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("application icon missing").clone())
                .tooltip("PicSecure Renew · reminders active")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            let _ = app.autolaunch().enable();
            start_notification_clock(app.handle().clone());
            if std::env::args().any(|arg| arg == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            Ok(())
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building PicSecure Renew")
        .run(|app, event| {
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = event
            {
                if label == "main" {
                    api.prevent_close();
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
            }
        });
}
