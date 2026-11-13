#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering as AtomicOrdering},
        mpsc, Mutex,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use sysinfo::{ProcessesToUpdate, System};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri::{
    ipc::{InvokeBody, Request, Response},
    menu::{CheckMenuItem, CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Wry, WindowEvent,
};

const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
const DEFAULT_KEEP_BACKUPS: usize = 20;
const UPDATER_KEY_PLACEHOLDER: &str = "REPLACE_WITH_YOUR_UPDATER_PUBLIC_KEY";
const TMP_SUFFIX: &str = ".whiteout-tmp";
const QUIET_MS: u64 = 400;
const DATA_FILES: [&str; 4] = ["pins", "trail", "loadouts", "bookmarks"];
const DATA_VERSION: u64 = 1;
const MAX_DATA_BYTES: usize = 8 * 1024 * 1024;
const TLD_STEAM_APP_ID: &str = "305620";
const RESCUE_DIR: &str = "Whiteout-backups";
const RESCUE_GRACE_MS: u64 = 1000;
const FLATPAK_STEAM: &str = "com.valvesoftware.Steam";

#[derive(Default)]
struct Remote {
    main: Mutex<Option<String>>,
    digits: AtomicBool,
}

#[derive(Default)]
struct Watch {
    watcher: Mutex<Option<RecommendedWatcher>>,
    dir: Mutex<Option<PathBuf>>,
}

#[derive(Default)]
struct GuardState {
    path: Option<PathBuf>,
    snapshot: Option<Vec<u8>>,
    extra: Option<String>,
    offset_min: i32,
}

#[derive(Default)]
struct Guard {
    state: Mutex<GuardState>,
}

#[derive(Serialize, Clone)]
struct Rescued {
    name: String,
    path: String,
}

#[derive(Serialize)]
struct SaveEntry {
    name: String,
    size: u64,
    modified: i64,
}

#[derive(Serialize, Debug)]
struct Stamp {
    size: u64,
    modified: i64,
}

#[derive(Serialize)]
struct DirSearch {
    found: Option<String>,
    tried: Vec<String>,
}

#[derive(Serialize, Debug, PartialEq)]
struct DataFile {
    text: Option<String>,
    modified: Option<i64>,
}

#[derive(Serialize, Debug)]
struct DataDirInfo {
    available: bool,
    files: BTreeMap<String, i64>,
}

#[derive(Serialize)]
struct BackupEntry {
    id: String,
    size: u64,
    modified: i64,
    label: Option<String>,
    locked: bool,
    auto: bool,
}

#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
struct BackupMeta {
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    locked: bool,
    #[serde(default)]
    auto: bool,
}

struct MenuItems {
    save: MenuItem<Wry>,
    save_copy: MenuItem<Wry>,
    follow: CheckMenuItem<Wry>,
}

struct Backups {
    keep: AtomicUsize,
}

impl Default for Backups {
    fn default() -> Self {
        Backups { keep: AtomicUsize::new(DEFAULT_KEEP_BACKUPS) }
    }
}

#[derive(Serialize, Debug, PartialEq)]
struct BackupUsage {
    bytes: u64,
    files: usize,
}

#[derive(Default)]
struct Shell {
    close_to_tray: AtomicBool,
    tray: Mutex<Option<TrayIcon<Wry>>>,
    items: Mutex<Option<MenuItems>>,
}

#[derive(Default)]
struct Expect {
    size: Option<u64>,
    modified: Option<i64>,
    allow_running: bool,
}

fn modified_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn stamp_of(path: &Path) -> Result<Stamp, String> {
    let meta = fs::metadata(path).map_err(|e| format!("io: {e}"))?;
    Ok(Stamp {
        size: meta.len(),
        modified: modified_ms(&meta),
    })
}

fn is_ours(name: &str) -> bool {
    name.ends_with(TMP_SUFFIX)
}

fn same_dir(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => a == b,
    }
}

fn header(req: &Request, key: &str) -> Option<String> {
    req.headers()
        .get(key)
        .and_then(|v| v.to_str().ok())
        .map(|s| percent_decode_str(s).decode_utf8_lossy().into_owned())
}

fn body_bytes<'a>(req: &'a Request<'a>) -> Result<&'a Vec<u8>, String> {
    match req.body() {
        InvokeBody::Raw(data) if !data.is_empty() && (data.len() as u64) <= MAX_FILE_BYTES => Ok(data),
        _ => Err("bad_request".into()),
    }
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let name = path
        .file_name()
        .ok_or("bad_request")?
        .to_string_lossy()
        .to_string();
    let tmp = path.with_file_name(format!("{name}{TMP_SUFFIX}"));
    let written = (|| -> std::io::Result<()> {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(data)?;
        f.sync_all()
    })();
    if let Err(e) = written {
        let _ = fs::remove_file(&tmp);
        return Err(format!("io: {e}"));
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("io: {e}"));
    }
    Ok(())
}

fn fnv(s: &str) -> u32 {
    let mut h: u32 = 0x811c9dc5;
    for b in s.to_lowercase().bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}

fn backup_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("backups"))
        .map_err(|e| format!("io: {e}"))
}

fn backup_dir(root: &Path, file: &Path) -> PathBuf {
    let name: String = file
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let parent = file.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    root.join(format!("{name}-{:08x}", fnv(&parent)))
}

fn list_backup_files(dir: &Path) -> Vec<(i64, u64, String)> {
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let fname = e.file_name().to_string_lossy().to_string();
            if let Some(ms) = fname.strip_suffix(".bak").and_then(|s| s.parse::<i64>().ok()) {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                out.push((ms, size, fname));
            }
        }
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.0));
    out
}

fn meta_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.meta", id.trim_end_matches(".bak")))
}

fn read_meta(dir: &Path, id: &str) -> BackupMeta {
    fs::read_to_string(meta_path(dir, id))
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_meta(dir: &Path, id: &str, meta: &BackupMeta) -> Result<(), String> {
    let text = serde_json::to_string(meta).map_err(|e| format!("io: {e}"))?;
    atomic_write(&meta_path(dir, id), text.as_bytes())
}

fn valid_backup_id(id: &str) -> bool {
    id.strip_suffix(".bak")
        .is_some_and(|s| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit()))
}

fn clean_label(label: Option<String>) -> Option<String> {
    label
        .map(|l| l.trim().chars().take(60).collect::<String>())
        .filter(|l| !l.is_empty())
}

fn prune_backups(dir: &Path, keep: usize, fresh: &str) {
    if keep == 0 {
        return;
    }
    let mut kept = 0usize;
    for (_, _, fname) in list_backup_files(dir) {
        let meta = read_meta(dir, &fname);
        if meta.locked || meta.label.is_some() {
            continue;
        }
        kept += 1;
        if kept > keep && fname != fresh {
            let _ = fs::remove_file(dir.join(&fname));
            let _ = fs::remove_file(meta_path(dir, &fname));
        }
    }
}

fn backup_usage_in(root: &Path) -> BackupUsage {
    let mut usage = BackupUsage { bytes: 0, files: 0 };
    if let Ok(rd) = fs::read_dir(root) {
        for dir in rd.flatten().filter(|e| e.path().is_dir()) {
            for (_, size, _) in list_backup_files(&dir.path()) {
                usage.bytes += size;
                usage.files += 1;
            }
        }
    }
    usage
}

fn same_content(a: &Path, b: &Path) -> bool {
    let (Ok(ma), Ok(mb)) = (fs::metadata(a), fs::metadata(b)) else { return false };
    ma.len() == mb.len() && matches!((fs::read(a), fs::read(b)), (Ok(x), Ok(y)) if x == y)
}

fn backup_file(root: &Path, file: &Path, meta: &BackupMeta, skip_identical: bool, keep: usize) -> Result<Option<String>, String> {
    if !file.is_file() {
        return Ok(None);
    }
    let dir = backup_dir(root, file);
    fs::create_dir_all(&dir).map_err(|e| format!("io: {e}"))?;
    if skip_identical {
        if let Some((_, _, newest)) = list_backup_files(&dir).into_iter().next() {
            if same_content(file, &dir.join(newest)) {
                return Ok(None);
            }
        }
    }
    let newest = list_backup_files(&dir).first().map_or(i64::MIN, |b| b.0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
        .max(newest.saturating_add(1));
    let id = format!("{now}.bak");
    fs::copy(file, dir.join(&id)).map_err(|e| format!("io: {e}"))?;
    if *meta != BackupMeta::default() {
        write_meta(&dir, &id, meta)?;
    }
    prune_backups(&dir, keep, &id);
    Ok(Some(id))
}

fn data_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !DATA_FILES.contains(&name) {
        return Err("bad_request".into());
    }
    Ok(dir.join(format!("{name}.json")))
}

fn check_data(text: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(text).map_err(|_| "corrupt")?;
    if !value.is_object() {
        return Err("corrupt".into());
    }
    match value.get("version").and_then(|v| v.as_u64()) {
        Some(DATA_VERSION) => Ok(()),
        Some(v) if v > DATA_VERSION => Err("newer".into()),
        _ => Err("corrupt".into()),
    }
}

fn read_data(dir: &Path, name: &str) -> Result<DataFile, String> {
    let path = data_path(dir, name)?;
    if !dir.is_dir() {
        return Err("unavailable".into());
    }
    match fs::read_to_string(&path) {
        Ok(text) => {
            check_data(&text)?;
            Ok(DataFile { text: Some(text), modified: Some(stamp_of(&path)?.modified) })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(DataFile { text: None, modified: None }),
        Err(e) if e.kind() == std::io::ErrorKind::InvalidData => Err("corrupt".into()),
        Err(_) => Err("unavailable".into()),
    }
}

fn write_data(dir: &Path, name: &str, text: &str, expect: Option<i64>) -> Result<i64, String> {
    let path = data_path(dir, name)?;
    if text.len() > MAX_DATA_BYTES || check_data(text).is_err() {
        return Err("bad_request".into());
    }
    if !dir.is_dir() {
        return Err("unavailable".into());
    }
    if path.is_file() {
        let current = fs::read_to_string(&path).map_err(|_| "corrupt")?;
        check_data(&current)?;
        if expect != Some(stamp_of(&path)?.modified) {
            return Err("changed".into());
        }
    }
    atomic_write(&path, text.as_bytes())?;
    Ok(stamp_of(&path)?.modified)
}

fn stat_data(dir: &Path) -> DataDirInfo {
    let mut files = BTreeMap::new();
    if !dir.is_dir() {
        return DataDirInfo { available: false, files };
    }
    for name in DATA_FILES {
        if let Ok(st) = stamp_of(&dir.join(format!("{name}.json"))) {
            files.insert(name.to_string(), st.modified);
        }
    }
    DataDirInfo { available: true, files }
}

fn exe_base(name: &str) -> &str {
    name.strip_suffix(".exe").or_else(|| name.strip_suffix(".x86_64")).unwrap_or(name)
}

fn is_game_process(name: &str, extra: Option<&str>) -> bool {
    let lower = name.to_lowercase();
    let base = exe_base(&lower);
    if matches!(base, "tld" | "thelongdark" | "the long dark") {
        return true;
    }
    let extra = extra.map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());
    match extra {
        Some(e) => base == exe_base(&e),
        None => false,
    }
}

fn game_process_name(extra: Option<&str>) -> Option<String> {
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes()
        .values()
        .map(|p| p.name().to_string_lossy().to_string())
        .find(|n| is_game_process(n, extra))
}

fn guarded_write(
    root: &Path,
    game_dir: Option<&Path>,
    path: &Path,
    data: &[u8],
    expect: &Expect,
    keep: usize,
    game_running: &dyn Fn() -> bool,
) -> Result<Stamp, String> {
    let parent = path.parent().filter(|p| p.is_dir()).ok_or("bad_request")?;
    if !expect.allow_running {
        let in_game_dir = game_dir.is_some_and(|g| same_dir(g, parent));
        if in_game_dir && game_running() {
            return Err("game_running".into());
        }
    }
    if path.is_file() {
        let now = stamp_of(path)?;
        if expect.size.is_some_and(|v| v != now.size) || expect.modified.is_some_and(|v| v != now.modified) {
            return Err("changed".into());
        }
        backup_file(root, path, &BackupMeta::default(), false, keep)?;
    }
    atomic_write(path, data)?;
    stamp_of(path)
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = z.rem_euclid(146097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

fn stamp_text(ms: i64, offset_min: i32) -> String {
    let secs = ms.div_euclid(1000) + i64::from(offset_min) * 60;
    let (y, m, d) = civil_from_days(secs.div_euclid(86400));
    let rem = secs.rem_euclid(86400);
    format!("{y:04}-{m:02}-{d:02}_{:02}-{:02}-{:02}", rem / 3600, rem % 3600 / 60, rem % 60)
}

fn rescue_dir_for(watched: &Path) -> PathBuf {
    watched.parent().unwrap_or(watched).join(RESCUE_DIR)
}

fn read_snapshot(path: &Path) -> Option<Vec<u8>> {
    let before = fs::metadata(path).ok()?;
    if !before.is_file() || before.len() > MAX_FILE_BYTES {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let after = fs::metadata(path).ok()?;
    let stable = after.len() == before.len() && modified_ms(&after) == modified_ms(&before) && bytes.len() as u64 == after.len();
    stable.then_some(bytes)
}

fn rescue_write(dest_dir: &Path, name: &str, data: &[u8], now_ms: i64, offset_min: i32) -> Result<PathBuf, String> {
    fs::create_dir_all(dest_dir).map_err(|e| format!("io: {e}"))?;
    let stamp = stamp_text(now_ms, offset_min);
    for n in 0..1000 {
        let suffix = if n == 0 { String::new() } else { format!("-{n}") };
        let target = dest_dir.join(format!("{name}-{stamp}{suffix}"));
        if !target.exists() {
            atomic_write(&target, data)?;
            return Ok(target);
        }
    }
    Err("io: no free file name".into())
}

fn guard_step(state: &mut GuardState, watched: &Path, running: &dyn Fn() -> bool, now_ms: i64) -> Result<Option<PathBuf>, String> {
    let Some(path) = state.path.clone() else { return Ok(None) };
    if !path.parent().is_some_and(|p| same_dir(p, watched)) {
        return Ok(None);
    }
    if path.is_file() {
        if let Some(bytes) = read_snapshot(&path) {
            state.snapshot = Some(bytes);
        }
        return Ok(None);
    }
    let Some(bytes) = state.snapshot.take() else { return Ok(None) };
    if !running() {
        return Ok(None);
    }
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let written = rescue_write(&rescue_dir_for(watched), &name, &bytes, now_ms, state.offset_min);
    if written.is_err() {
        state.snapshot = Some(bytes);
    }
    written.map(Some)
}

fn guard_check(app: &AppHandle, watched: &Path) {
    let guard = app.state::<Guard>();
    let missing = guard
        .state
        .lock()
        .ok()
        .and_then(|s| s.path.clone())
        .is_some_and(|p| !p.exists());
    if missing {
        thread::sleep(Duration::from_millis(RESCUE_GRACE_MS));
    }
    let Ok(mut state) = guard.state.lock() else { return };
    let extra = state.extra.clone();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let name = state
        .path
        .as_ref()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    match guard_step(&mut state, watched, &|| game_process_name(extra.as_deref()).is_some(), now) {
        Ok(Some(target)) => {
            let _ = app.emit("save-rescued", Rescued { name, path: target.to_string_lossy().to_string() });
        }
        Ok(None) => {}
        Err(e) => {
            let _ = app.emit("save-rescue-failed", e);
        }
    }
}

fn list_saves_in(dir: &Path) -> Result<Vec<SaveEntry>, String> {
    let rd = fs::read_dir(dir).map_err(|e| format!("io: {e}"))?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || is_ours(&name) {
            continue;
        }
        let Ok(meta) = e.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        out.push(SaveEntry {
            name,
            size: meta.len(),
            modified: modified_ms(&meta),
        });
    }
    Ok(out)
}

fn start_watcher(path: &Path, on_batch: impl Fn(Vec<String>) + Send + 'static) -> Result<RecommendedWatcher, String> {
    let (tx, rx) = mpsc::channel::<Event>();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            let _ = tx.send(ev);
        }
    })
    .map_err(|e| format!("watch: {e}"))?;
    watcher
        .watch(path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("watch: {e}"))?;

    thread::spawn(move || {
        let names_of = |ev: &Event, into: &mut BTreeSet<String>| {
            if matches!(ev.kind, EventKind::Access(_)) {
                return;
            }
            for p in &ev.paths {
                if let Some(n) = p.file_name().map(|n| n.to_string_lossy().to_string()) {
                    if !n.starts_with('.') && !is_ours(&n) {
                        into.insert(n);
                    }
                }
            }
        };
        while let Ok(first) = rx.recv() {
            let mut names = BTreeSet::new();
            names_of(&first, &mut names);
            while let Ok(next) = rx.recv_timeout(Duration::from_millis(QUIET_MS)) {
                names_of(&next, &mut names);
            }
            if !names.is_empty() {
                on_batch(names.into_iter().collect());
            }
        }
    });
    Ok(watcher)
}

fn steam_library_paths(vdf: &str) -> Vec<PathBuf> {
    vdf.lines()
        .filter_map(|line| {
            let mut parts = line.split('"').filter(|s| !s.trim().is_empty());
            if parts.next()? != "path" {
                return None;
            }
            parts.next().map(PathBuf::from)
        })
        .collect()
}

fn proton_save_dirs(home: &Path) -> Vec<PathBuf> {
    let roots = [
        home.join(".steam").join("steam"),
        home.join(".local").join("share").join("Steam"),
        home.join(".var").join("app").join(FLATPAK_STEAM).join(".local").join("share").join("Steam"),
    ];
    let mut libs: Vec<PathBuf> = Vec::new();
    for root in roots.iter().filter(|r| r.is_dir()) {
        libs.push(root.clone());
        if let Ok(vdf) = fs::read_to_string(root.join("steamapps").join("libraryfolders.vdf")) {
            libs.extend(steam_library_paths(&vdf));
        }
    }
    let mut seen = BTreeSet::new();
    libs.into_iter()
        .map(|lib| lib.join("steamapps").join("compatdata").join(TLD_STEAM_APP_ID))
        .filter(|prefix| prefix.is_dir() && seen.insert(fs::canonicalize(prefix).unwrap_or_else(|_| prefix.clone())))
        .map(|prefix| {
            prefix
                .join("pfx")
                .join("drive_c")
                .join("users")
                .join("steamuser")
                .join("AppData")
                .join("LocalLow")
                .join("Hinterland")
                .join("TheLongDark")
        })
        .collect()
}

#[tauri::command(async)]
fn find_save_dir(app: AppHandle) -> DirSearch {
    let mut tried: Vec<PathBuf> = Vec::new();
    if let Ok(p) = app.path().local_data_dir() {
        let base = p.join("Hinterland").join("TheLongDark");
        tried.push(base.join("Survival"));
        tried.push(base);
    }
    if cfg!(target_os = "macos") {
        if let Ok(h) = app.path().home_dir() {
            let base = h.join(".local").join("share").join("Hinterland").join("TheLongDark");
            tried.push(base.join("Survival"));
            tried.push(base);
        }
    }
    if cfg!(target_os = "windows") {
        if let Ok(h) = app.path().home_dir() {
            let base = h.join("AppData").join("LocalLow").join("Hinterland").join("TheLongDark");
            tried.push(base.join("Survival"));
            tried.push(base);
        }
    }
    if cfg!(target_os = "linux") {
        if let Ok(h) = app.path().home_dir() {
            let flatpak = h.join(".var").join("app").join(FLATPAK_STEAM).join(".local").join("share").join("Hinterland").join("TheLongDark");
            for base in std::iter::once(flatpak).chain(proton_save_dirs(&h)) {
                tried.push(base.join("Survival"));
                tried.push(base);
            }
        }
    }
    let has_files = |p: &PathBuf| {
        fs::read_dir(p)
            .map(|rd| rd.flatten().any(|e| e.path().is_file()))
            .unwrap_or(false)
    };
    let found = tried
        .iter()
        .find(|p| has_files(p))
        .or_else(|| tried.iter().find(|p| p.is_dir()))
        .map(|p| p.to_string_lossy().to_string());
    DirSearch {
        found,
        tried: tried.iter().map(|p| p.to_string_lossy().to_string()).collect(),
    }
}

#[tauri::command(async)]
fn list_saves(dir: String) -> Result<Vec<SaveEntry>, String> {
    list_saves_in(Path::new(&dir))
}

#[tauri::command(async)]
fn stat_file(path: String) -> Result<Stamp, String> {
    stamp_of(Path::new(&path))
}

#[tauri::command(async)]
fn read_save(path: String) -> Result<Response, String> {
    let meta = fs::metadata(&path).map_err(|e| format!("io: {e}"))?;
    if meta.len() > MAX_FILE_BYTES {
        return Err("too_large".into());
    }
    let bytes = fs::read(&path).map_err(|e| format!("io: {e}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command(async)]
fn write_save(request: Request<'_>, app: AppHandle, watch: State<'_, Watch>, backups: State<'_, Backups>) -> Result<Stamp, String> {
    let data = body_bytes(&request)?;
    let path = PathBuf::from(header(&request, "x-path").ok_or("bad_request")?);
    let expect = Expect {
        size: header(&request, "x-expected-size").and_then(|s| s.parse().ok()),
        modified: header(&request, "x-expected-modified").and_then(|s| s.parse().ok()),
        allow_running: header(&request, "x-allow-running").as_deref() == Some("1"),
    };
    let extra = header(&request, "x-process-name");
    let game_dir = watch.dir.lock().map_err(|_| "io: lock")?.clone();
    guarded_write(
        &backup_root(&app)?,
        game_dir.as_deref(),
        &path,
        data,
        &expect,
        backups.keep.load(AtomicOrdering::SeqCst),
        &|| game_process_name(extra.as_deref()).is_some(),
    )
}

#[tauri::command(async)]
fn write_copy(request: Request<'_>) -> Result<Stamp, String> {
    let data = body_bytes(&request)?;
    let path = PathBuf::from(header(&request, "x-path").ok_or("bad_request")?);
    if path.parent().map_or(true, |p| !p.is_dir()) {
        return Err("bad_request".into());
    }
    atomic_write(&path, data)?;
    stamp_of(&path)
}

#[tauri::command(async)]
fn list_backups(app: AppHandle, path: String) -> Result<Vec<BackupEntry>, String> {
    let dir = backup_dir(&backup_root(&app)?, Path::new(&path));
    Ok(list_backup_files(&dir)
        .into_iter()
        .map(|(modified, size, id)| {
            let meta = read_meta(&dir, &id);
            BackupEntry { id, size, modified, label: meta.label, locked: meta.locked, auto: meta.auto }
        })
        .collect())
}

#[tauri::command(async)]
fn read_backup(app: AppHandle, path: String, id: String) -> Result<Response, String> {
    if !valid_backup_id(&id) {
        return Err("bad_request".into());
    }
    let file = backup_dir(&backup_root(&app)?, Path::new(&path)).join(&id);
    let bytes = fs::read(file).map_err(|e| format!("io: {e}"))?;
    Ok(Response::new(bytes))
}

#[tauri::command(async)]
fn backup_now(app: AppHandle, backups: State<'_, Backups>, path: String, auto: bool, label: Option<String>) -> Result<Option<String>, String> {
    let meta = BackupMeta { label: clean_label(label), locked: false, auto };
    backup_file(&backup_root(&app)?, Path::new(&path), &meta, auto, backups.keep.load(AtomicOrdering::SeqCst))
}

#[tauri::command(async)]
fn set_backup_keep(backups: State<'_, Backups>, keep: usize) -> Result<(), String> {
    if keep != 0 && !(5..=200).contains(&keep) {
        return Err("bad_request".into());
    }
    backups.keep.store(keep, AtomicOrdering::SeqCst);
    Ok(())
}

#[tauri::command(async)]
fn backup_usage(app: AppHandle) -> Result<BackupUsage, String> {
    Ok(backup_usage_in(&backup_root(&app)?))
}

#[tauri::command(async)]
fn open_backup_folder(app: AppHandle) -> Result<(), String> {
    let root = backup_root(&app)?;
    fs::create_dir_all(&root).map_err(|e| format!("io: {e}"))?;
    tauri_plugin_opener::open_path(root, None::<&str>).map_err(|e| format!("io: {e}"))
}

#[tauri::command(async)]
fn backup_set(app: AppHandle, path: String, id: String, label: Option<String>, locked: bool) -> Result<(), String> {
    if !valid_backup_id(&id) {
        return Err("bad_request".into());
    }
    let dir = backup_dir(&backup_root(&app)?, Path::new(&path));
    if !dir.join(&id).is_file() {
        return Err("io: backup not found".into());
    }
    let mut meta = read_meta(&dir, &id);
    meta.label = clean_label(label);
    meta.locked = locked;
    if meta == BackupMeta::default() {
        let _ = fs::remove_file(meta_path(&dir, &id));
        return Ok(());
    }
    write_meta(&dir, &id, &meta)
}

#[tauri::command(async)]
fn backup_delete(app: AppHandle, path: String, id: String) -> Result<(), String> {
    if !valid_backup_id(&id) {
        return Err("bad_request".into());
    }
    let dir = backup_dir(&backup_root(&app)?, Path::new(&path));
    fs::remove_file(dir.join(&id)).map_err(|e| format!("io: {e}"))?;
    let _ = fs::remove_file(meta_path(&dir, &id));
    Ok(())
}

#[tauri::command(async)]
fn state_load(app: AppHandle) -> Result<String, String> {
    let file = app.path().app_data_dir().map_err(|e| format!("io: {e}"))?.join("state.json");
    match fs::read_to_string(&file) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok("{}".into()),
        Err(e) => Err(format!("io: {e}")),
    }
}

#[tauri::command(async)]
fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    if json.len() > 4 * 1024 * 1024 || serde_json::from_str::<serde_json::Value>(&json).is_err() {
        return Err("bad_request".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| format!("io: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("io: {e}"))?;
    atomic_write(&dir.join("state.json"), json.as_bytes())
}

#[tauri::command(async)]
fn data_default_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("io: {e}"))?.join("data");
    fs::create_dir_all(&dir).map_err(|e| format!("io: {e}"))?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command(async)]
fn data_stat(dir: String) -> DataDirInfo {
    stat_data(Path::new(&dir))
}

#[tauri::command(async)]
fn data_read(dir: String, name: String) -> Result<DataFile, String> {
    read_data(Path::new(&dir), &name)
}

#[tauri::command(async)]
fn data_write(dir: String, name: String, json: String, expect: Option<i64>) -> Result<i64, String> {
    write_data(Path::new(&dir), &name, &json, expect)
}

#[tauri::command(async)]
fn open_notices(app: AppHandle) -> Result<(), String> {
    let file = app.path().resource_dir().map_err(|e| format!("io: {e}"))?.join("THIRD-PARTY-NOTICES.txt");
    if !file.is_file() {
        return Err("io: notices not found".into());
    }
    tauri_plugin_opener::open_path(file, None::<&str>).map_err(|e| format!("io: {e}"))
}

#[tauri::command(async)]
fn open_folder(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err("io: folder not found".into());
    }
    tauri_plugin_opener::open_path(p, None::<&str>).map_err(|e| format!("io: {e}"))
}

fn updater_key_set(key: Option<&str>) -> bool {
    key.map(str::trim).is_some_and(|k| !k.is_empty() && k != UPDATER_KEY_PLACEHOLDER && !k.starts_with("REPLACE"))
}

#[tauri::command]
fn updater_ready(app: AppHandle) -> bool {
    let key = app.config().plugins.0.get("updater").and_then(|u| u.get("pubkey")).and_then(|k| k.as_str());
    updater_key_set(key)
}

#[tauri::command(async)]
fn game_running(extra: Option<String>, guard: State<'_, Guard>) -> Option<String> {
    if let Ok(mut state) = guard.state.lock() {
        state.extra = extra.clone();
    }
    game_process_name(extra.as_deref())
}

#[tauri::command(async)]
fn guard_track(path: Option<String>, offset_min: i32, guard: State<'_, Guard>) -> Result<(), String> {
    let mut state = guard.state.lock().map_err(|_| "io: lock")?;
    state.snapshot = path.as_deref().and_then(|p| read_snapshot(Path::new(p)));
    state.path = path.map(PathBuf::from);
    state.offset_min = offset_min;
    Ok(())
}

#[tauri::command(async)]
fn watch_dir(dir: String, app: AppHandle, watch: State<'_, Watch>) -> Result<(), String> {
    let path = PathBuf::from(&dir);
    if !path.is_dir() {
        return Err("io: folder not found".into());
    }
    let watched = path.clone();
    let watcher = start_watcher(&path, move |names| {
        let _ = app.emit("saves-changed", names);
        guard_check(&app, &watched);
    })?;
    watch.watcher.lock().map_err(|_| "io: lock")?.replace(watcher);
    watch.dir.lock().map_err(|_| "io: lock")?.replace(path);
    Ok(())
}

#[tauri::command(async)]
fn unwatch_dir(watch: State<'_, Watch>) {
    if let Ok(mut w) = watch.watcher.lock() {
        w.take();
    }
    if let Ok(mut d) = watch.dir.lock() {
        d.take();
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn set_tray(app: &AppHandle, shell: &Shell, on: bool) -> Result<(), String> {
    let mut slot = shell.tray.lock().map_err(|_| "io: lock")?;
    if !on {
        slot.take();
        return Ok(());
    }
    if slot.is_some() {
        return Ok(());
    }
    let err = |e: tauri::Error| format!("io: {e}");
    let show = MenuItemBuilder::with_id("tray-show", "Show Whiteout").build(app).map_err(err)?;
    let quit = MenuItemBuilder::with_id("tray-quit", "Quit").build(app).map_err(err)?;
    let menu = MenuBuilder::new(app).item(&show).separator().item(&quit).build().map_err(err)?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Whiteout")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-show" => show_main(app),
            "tray-quit" => {
                show_main(app);
                let _ = app.emit("menu", "quit");
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    #[cfg(target_os = "macos")]
    let template = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png")).ok();
    #[cfg(not(target_os = "macos"))]
    let template: Option<tauri::image::Image<'static>> = None;
    builder = match template {
        Some(img) => builder.icon(img).icon_as_template(true),
        None => match app.default_window_icon() {
            Some(icon) => builder.icon(icon.clone()),
            None => builder,
        },
    };
    slot.replace(builder.build(app).map_err(err)?);
    Ok(())
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command(async)]
fn set_close_to_tray(app: AppHandle, shell: State<'_, Shell>, enabled: bool) -> Result<(), String> {
    shell.close_to_tray.store(enabled, AtomicOrdering::SeqCst);
    set_tray(&app, &shell, enabled)
}

const REMOTE_DIGITS: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

fn remote_emit(app: &AppHandle, payload: String) {
    let _ = app.emit("remote", payload);
}

#[tauri::command(async)]
fn remote_set(app: AppHandle, remote: State<'_, Remote>, accel: Option<String>) -> Result<(), String> {
    let gs = app.global_shortcut();
    let mut cur = remote.main.lock().map_err(|_| "io: lock")?;
    if let Some(old) = cur.take() {
        let _ = gs.unregister(old.as_str());
    }
    let Some(next) = accel.map(|a| a.trim().to_string()).filter(|a| !a.is_empty()) else {
        return Ok(());
    };
    gs.on_shortcut(next.as_str(), |app, _, event| {
        if event.state() == ShortcutState::Pressed {
            remote_emit(app, "toggle".into());
        }
    })
    .map_err(|e| format!("shortcut: {e}"))?;
    *cur = Some(next);
    Ok(())
}

#[tauri::command(async)]
fn remote_digits(app: AppHandle, remote: State<'_, Remote>, on: bool) -> Result<(), String> {
    let gs = app.global_shortcut();
    if on == remote.digits.load(AtomicOrdering::SeqCst) {
        return Ok(());
    }
    if on {
        for d in REMOTE_DIGITS {
            let tag = d.to_string();
            let _ = gs.on_shortcut(d, move |app, _, event| {
                if event.state() == ShortcutState::Pressed {
                    remote_emit(app, format!("digit:{tag}"));
                }
            });
        }
    } else {
        for d in REMOTE_DIGITS {
            let _ = gs.unregister(d);
        }
    }
    remote.digits.store(on, AtomicOrdering::SeqCst);
    Ok(())
}

#[tauri::command(async)]
fn set_menu_state(shell: State<'_, Shell>, slot_open: bool, follow: bool) -> Result<(), String> {
    let guard = shell.items.lock().map_err(|_| "io: lock")?;
    if let Some(items) = guard.as_ref() {
        let err = |e: tauri::Error| format!("io: {e}");
        items.save.set_enabled(slot_open).map_err(err)?;
        items.save_copy.set_enabled(slot_open).map_err(err)?;
        items.follow.set_checked(follow).map_err(err)?;
    }
    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<(Menu<Wry>, MenuItems)> {
    let mac = cfg!(target_os = "macos");
    let item = |id: &str, text: &str, accel: &str| MenuItemBuilder::with_id(id, text).accelerator(accel).build(app);
    let open = item("open", "Open File…", "CmdOrCtrl+O")?;
    let slots = item("slots", "Game Saves…", "CmdOrCtrl+Shift+O")?;
    let save = MenuItemBuilder::with_id("save", "Save to Game").accelerator("CmdOrCtrl+S").enabled(false).build(app)?;
    let save_copy = MenuItemBuilder::with_id("savecopy", "Save a Copy…").accelerator("CmdOrCtrl+Shift+S").enabled(false).build(app)?;
    let settings = item("settings", "Settings…", "CmdOrCtrl+,")?;
    let quit = item("quit", if mac { "Quit Whiteout" } else { "Quit" }, "CmdOrCtrl+Q")?;
    let undo = item("undo", "Undo Change", "CmdOrCtrl+Z")?;
    let redo = item("redo", "Redo", "CmdOrCtrl+Shift+Z")?;
    let palette = item("palette", "Command Palette…", "CmdOrCtrl+K")?;
    let view_edit = item("view-edit", "Editor", "CmdOrCtrl+1")?;
    let view_map = item("view-map", "Map", "CmdOrCtrl+2")?;
    let follow = CheckMenuItemBuilder::with_id("follow", "Follow Player").accelerator("CmdOrCtrl+3").checked(false).build(app)?;

    let mut file = SubmenuBuilder::new(app, "File").item(&open).item(&slots).separator().item(&save).item(&save_copy);
    if !mac {
        file = file.separator().item(&settings).separator().item(&quit);
    }
    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&palette);
    let view = SubmenuBuilder::new(app, "View")
        .item(&view_edit)
        .item(&view_map)
        .separator()
        .item(&follow)
        .separator()
        .fullscreen();
    let window = SubmenuBuilder::new(app, "Window").minimize().maximize().close_window();

    let mut menu = MenuBuilder::new(app);
    if mac {
        let app_menu = SubmenuBuilder::new(app, "Whiteout")
            .about(None)
            .separator()
            .item(&settings)
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .item(&quit)
            .build()?;
        menu = menu.item(&app_menu);
    }
    let menu = menu.item(&file.build()?).item(&edit.build()?).item(&view.build()?).item(&window.build()?).build()?;
    Ok((menu, MenuItems { save, save_copy, follow }))
}

#[cfg(windows)]
fn restart_once(app: &AppHandle) {
    if std::env::var_os("WHITEOUT_RECOVERED").is_some() {
        return;
    }
    std::env::set_var("WHITEOUT_RECOVERED", "1");
    app.restart();
}

#[cfg(windows)]
fn guard_webview(app: &AppHandle) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    };
    use webview2_com::ProcessFailedEventHandler;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let handle = app.clone();
    let _ = window.with_webview(move |platform| unsafe {
        let Ok(core) = platform.controller().CoreWebView2() else {
            return;
        };
        let handler = ProcessFailedEventHandler::create(Box::new(move |sender, args| {
            let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
            if let Some(args) = args {
                let _ = args.ProcessFailedKind(&mut kind);
            }
            if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
                restart_once(&handle);
            } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
                || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
                || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED
            {
                if let Some(sender) = sender {
                    let _ = sender.Reload();
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core.add_ProcessFailed(&handler, &mut token);
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Watch::default())
        .manage(Shell::default())
        .manage(Backups::default())
        .manage(Guard::default())
        .manage(Remote::default())
        .setup(|app| {
            let handle = app.handle();
            let (menu, items) = build_menu(handle)?;
            app.set_menu(menu)?;
            #[cfg(windows)]
            guard_webview(handle);
            app.state::<Shell>().items.lock().map_err(|_| "lock")?.replace(items);
            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().0.clone();
            if !id.starts_with("tray-") {
                let _ = app.emit("menu", id);
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Shell>().close_to_tray.load(AtomicOrdering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            find_save_dir,
            list_saves,
            stat_file,
            read_save,
            write_save,
            write_copy,
            list_backups,
            read_backup,
            backup_now,
            backup_set,
            backup_delete,
            set_backup_keep,
            backup_usage,
            open_backup_folder,
            state_load,
            state_save,
            data_default_dir,
            data_stat,
            data_read,
            data_write,
            open_folder,
            open_notices,
            updater_ready,
            game_running,
            guard_track,
            watch_dir,
            unwatch_dir,
            set_close_to_tray,
            quit_app,
            set_menu_state,
            remote_set,
            remote_digits,
        ])
        .run(tauri::generate_context!())
        .expect("failed to start Whiteout");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn sweep_old_test_dirs() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let Ok(rd) = fs::read_dir(std::env::temp_dir()) else { return };
            for e in rd.flatten() {
                let stale = e.file_name().to_string_lossy().starts_with("whiteout-test-")
                    && e.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age > Duration::from_secs(3600));
                if stale {
                    let _ = fs::remove_dir_all(e.path());
                }
            }
        });
    }

    fn temp(tag: &str) -> PathBuf {
        sweep_old_test_dirs();
        static N: AtomicU32 = AtomicU32::new(0);
        let p = std::env::temp_dir().join(format!("whiteout-test-{}-{}-{tag}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn no_game() -> bool {
        false
    }
    fn game_on() -> bool {
        true
    }

    #[test]
    fn write_replaces_file_and_keeps_a_backup() {
        let game = temp("game");
        let root = temp("root");
        let file = game.join("sandbox1");
        fs::write(&file, b"old").unwrap();
        let st = guarded_write(&root, Some(&game), &file, b"new", &Expect::default(), 20, &no_game).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"new");
        assert_eq!(st.size, 3);
        let backups = list_backup_files(&backup_dir(&root, &file));
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read(backup_dir(&root, &file).join(&backups[0].2)).unwrap(), b"old");
        let leftovers: Vec<_> = fs::read_dir(&game).unwrap().flatten().filter(|e| is_ours(&e.file_name().to_string_lossy())).collect();
        assert!(leftovers.is_empty(), "temp file left in the folder");
    }

    #[test]
    fn write_refuses_when_file_changed_since_it_was_read() {
        let game = temp("game");
        let root = temp("root");
        let file = game.join("sandbox1");
        fs::write(&file, b"old").unwrap();
        let seen = stamp_of(&file).unwrap();
        fs::write(&file, b"game saved first").unwrap();
        let expect = Expect { size: Some(seen.size), modified: Some(seen.modified), allow_running: false };
        assert_eq!(guarded_write(&root, Some(&game), &file, b"new", &expect, 20, &no_game).unwrap_err(), "changed");
        assert_eq!(fs::read(&file).unwrap(), b"game saved first");
        assert!(list_backup_files(&backup_dir(&root, &file)).is_empty());
    }

    #[test]
    fn write_accepts_matching_stamp() {
        let game = temp("game");
        let root = temp("root");
        let file = game.join("sandbox1");
        fs::write(&file, b"old").unwrap();
        let seen = stamp_of(&file).unwrap();
        let expect = Expect { size: Some(seen.size), modified: Some(seen.modified), allow_running: false };
        guarded_write(&root, Some(&game), &file, b"new", &expect, 20, &no_game).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"new");
    }

    #[test]
    fn running_game_blocks_writes_only_in_the_game_folder() {
        let game = temp("game");
        let other = temp("other");
        let root = temp("root");
        let in_game = game.join("sandbox1");
        let elsewhere = other.join("copy");
        fs::write(&in_game, b"old").unwrap();
        assert_eq!(guarded_write(&root, Some(&game), &in_game, b"new", &Expect::default(), 20, &game_on).unwrap_err(), "game_running");
        assert_eq!(fs::read(&in_game).unwrap(), b"old");
        assert!(list_backup_files(&backup_dir(&root, &in_game)).is_empty());
        guarded_write(&root, Some(&game), &elsewhere, b"copy", &Expect::default(), 20, &game_on).unwrap();
        assert_eq!(fs::read(&elsewhere).unwrap(), b"copy");
        let allow = Expect { allow_running: true, ..Expect::default() };
        guarded_write(&root, Some(&game), &in_game, b"forced", &allow, 20, &game_on).unwrap();
        assert_eq!(fs::read(&in_game).unwrap(), b"forced");
    }

    #[test]
    fn creating_a_new_file_needs_no_backup() {
        let game = temp("game");
        let root = temp("root");
        let file = game.join("fresh");
        guarded_write(&root, Some(&game), &file, b"x", &Expect::default(), 20, &no_game).unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"x");
        assert!(list_backup_files(&backup_dir(&root, &file)).is_empty());
    }

    fn stamp_backup(root: &Path, file: &Path, n: usize, keep: usize) -> Option<String> {
        fs::write(file, format!("v{n}")).unwrap();
        backup_file(root, file, &BackupMeta::default(), false, keep).unwrap()
    }

    #[test]
    fn only_the_newest_backups_are_kept() {
        let game = temp("game");
        let root = temp("root");
        let file = game.join("sandbox1");
        fs::write(&file, b"0").unwrap();
        for i in 1..=DEFAULT_KEEP_BACKUPS + 5 {
            guarded_write(&root, Some(&game), &file, i.to_string().as_bytes(), &Expect::default(), DEFAULT_KEEP_BACKUPS, &no_game).unwrap();
        }
        let backups = list_backup_files(&backup_dir(&root, &file));
        assert_eq!(backups.len(), DEFAULT_KEEP_BACKUPS);
        let newest = fs::read(backup_dir(&root, &file).join(&backups[0].2)).unwrap();
        assert_eq!(newest, (DEFAULT_KEEP_BACKUPS + 4).to_string().as_bytes());
    }

    #[test]
    fn a_new_backup_is_always_the_newest() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        let dir = backup_dir(&root, &file);
        fs::create_dir_all(&dir).unwrap();
        let ahead = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64 + 60_000;
        fs::write(dir.join(format!("{ahead}.bak")), b"old").unwrap();
        let id = stamp_backup(&root, &file, 1, 1).unwrap();
        assert_eq!(list_backup_files(&dir).iter().map(|b| b.2.clone()).collect::<Vec<_>>(), vec![id]);
    }

    #[test]
    fn pruning_follows_the_chosen_limit() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        for i in 0..12 {
            stamp_backup(&root, &file, i, 5);
        }
        assert_eq!(list_backup_files(&backup_dir(&root, &file)).len(), 5);
        for i in 12..20 {
            stamp_backup(&root, &file, i, 200);
        }
        assert_eq!(list_backup_files(&backup_dir(&root, &file)).len(), 13);
    }

    #[test]
    fn named_and_locked_backups_survive_pruning() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        let bdir = backup_dir(&root, &file);
        let named = stamp_backup(&root, &file, 0, 5).unwrap();
        write_meta(&bdir, &named, &BackupMeta { label: Some("before the mountain".into()), locked: false, auto: false }).unwrap();
        let locked = stamp_backup(&root, &file, 1, 5).unwrap();
        write_meta(&bdir, &locked, &BackupMeta { label: None, locked: true, auto: true }).unwrap();
        for i in 2..30 {
            stamp_backup(&root, &file, i, 5);
        }
        assert!(bdir.join(&named).exists());
        assert_eq!(read_meta(&bdir, &named).label.as_deref(), Some("before the mountain"));
        assert!(bdir.join(&locked).exists());
        assert_eq!(list_backup_files(&bdir).len(), 7);
    }

    #[test]
    fn the_new_backup_is_never_pruned() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        let bdir = backup_dir(&root, &file);
        fs::create_dir_all(&bdir).unwrap();
        let future = "99999999999999.bak";
        fs::write(bdir.join(future), b"from a clock in the future").unwrap();
        for i in 0..6 {
            stamp_backup(&root, &file, i, 5);
        }
        let fresh = stamp_backup(&root, &file, 6, 5).unwrap();
        assert!(bdir.join(&fresh).exists(), "the backup just made was deleted");
        assert_eq!(fs::read(bdir.join(&fresh)).unwrap(), b"v6");
    }

    #[test]
    fn keep_all_never_prunes() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        for i in 0..40 {
            stamp_backup(&root, &file, i, 0);
        }
        assert_eq!(list_backup_files(&backup_dir(&root, &file)).len(), 40);
    }

    #[test]
    fn auto_backups_skip_identical_content() {
        let root = temp("root");
        let file = temp("dir").join("s1");
        let auto = BackupMeta { label: None, locked: false, auto: true };
        fs::write(&file, b"a").unwrap();
        assert!(backup_file(&root, &file, &auto, true, 20).unwrap().is_some());
        assert!(backup_file(&root, &file, &auto, true, 20).unwrap().is_none());
        fs::write(&file, b"b").unwrap();
        assert!(backup_file(&root, &file, &auto, true, 20).unwrap().is_some());
    }

    #[test]
    fn disk_usage_counts_every_slot() {
        let root = temp("root");
        let a = temp("a").join("sandbox1");
        let b = temp("b").join("sandbox2");
        fs::write(&a, b"12345").unwrap();
        fs::write(&b, b"123").unwrap();
        backup_file(&root, &a, &BackupMeta { label: Some("x".into()), locked: false, auto: false }, false, 20).unwrap();
        backup_file(&root, &b, &BackupMeta::default(), false, 20).unwrap();
        assert_eq!(backup_usage_in(&root), BackupUsage { bytes: 8, files: 2 });
        assert_eq!(backup_usage_in(&root.join("missing")), BackupUsage { bytes: 0, files: 0 });
    }

    #[test]
    fn backup_ids_and_labels_are_sanitised() {
        assert!(valid_backup_id("123.bak"));
        assert!(!valid_backup_id("../123.bak"));
        assert!(!valid_backup_id(".bak"));
        assert!(!valid_backup_id("12a.bak"));
        assert_eq!(clean_label(Some("  ".into())), None);
        assert_eq!(clean_label(Some(" name ".into())), Some("name".into()));
        assert_eq!(clean_label(Some("x".repeat(100))).unwrap().chars().count(), 60);
    }

    #[test]
    fn same_name_in_different_folders_gets_separate_backups() {
        let root = temp("root");
        let a = temp("a").join("sandbox1");
        let b = temp("b").join("sandbox1");
        assert_ne!(backup_dir(&root, &a), backup_dir(&root, &b));
    }

    #[test]
    fn missing_folder_is_rejected() {
        let root = temp("root");
        let bad = temp("x").join("missing").join("sandbox1");
        assert_eq!(guarded_write(&root, None, &bad, b"x", &Expect::default(), 20, &no_game).unwrap_err(), "bad_request");
    }

    #[test]
    fn listing_skips_folders_hidden_and_temporary_files() {
        let dir = temp("list");
        fs::write(dir.join("sandbox1"), b"a").unwrap();
        fs::write(dir.join(".hidden"), b"a").unwrap();
        fs::write(dir.join(format!("sandbox1{TMP_SUFFIX}")), b"a").unwrap();
        fs::create_dir_all(dir.join("subdir")).unwrap();
        let names: Vec<String> = list_saves_in(&dir).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, vec!["sandbox1".to_string()]);
    }

    fn data_json(key: &str) -> String {
        format!("{{\"version\":1,\"{key}\":[]}}")
    }

    #[test]
    fn data_files_round_trip_and_report_their_time() {
        let dir = temp("data");
        let text = r#"{"version":1,"pins":[{"id":"a"}]}"#;
        assert_eq!(read_data(&dir, "pins").unwrap(), DataFile { text: None, modified: None });
        let m = write_data(&dir, "pins", text, None).unwrap();
        let back = read_data(&dir, "pins").unwrap();
        assert_eq!(back.text.as_deref(), Some(text));
        assert_eq!(back.modified, Some(m));
        assert_eq!(stat_data(&dir).files.get("pins"), Some(&m));
        let next = r#"{"version":1,"pins":[]}"#;
        write_data(&dir, "pins", next, Some(m)).unwrap();
        assert_eq!(read_data(&dir, "pins").unwrap().text.as_deref(), Some(next));
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().flatten().filter(|e| is_ours(&e.file_name().to_string_lossy())).collect();
        assert!(leftovers.is_empty(), "temp file left in the data folder");
    }

    #[test]
    fn data_write_refuses_when_the_file_changed_on_another_device() {
        let dir = temp("data");
        let first = write_data(&dir, "loadouts", &data_json("loadouts"), None).unwrap();
        let other = r#"{"version":1,"loadouts":[{"id":"x"}]}"#;
        atomic_write(&dir.join("loadouts.json"), other.as_bytes()).unwrap();
        let other_time = stamp_of(&dir.join("loadouts.json")).unwrap().modified;
        let stale = if other_time == first { None } else { Some(first) };
        assert_eq!(write_data(&dir, "loadouts", &data_json("loadouts"), stale).unwrap_err(), "changed");
        assert_eq!(fs::read_to_string(dir.join("loadouts.json")).unwrap(), other);
        assert_eq!(write_data(&dir, "loadouts", &data_json("loadouts"), None).unwrap_err(), "changed");
    }

    #[test]
    fn missing_data_folder_is_reported_and_never_created() {
        let dir = temp("data").join("cloud-not-mounted");
        assert_eq!(read_data(&dir, "pins").unwrap_err(), "unavailable");
        assert_eq!(write_data(&dir, "pins", &data_json("pins"), None).unwrap_err(), "unavailable");
        assert!(!stat_data(&dir).available);
        assert!(!dir.exists());
    }

    #[test]
    fn corrupt_data_file_is_reported_and_not_overwritten() {
        let dir = temp("data");
        fs::write(dir.join("bookmarks.json"), b"{ not json").unwrap();
        assert_eq!(read_data(&dir, "bookmarks").unwrap_err(), "corrupt");
        let m = stamp_of(&dir.join("bookmarks.json")).unwrap().modified;
        assert_eq!(write_data(&dir, "bookmarks", &data_json("bookmarks"), Some(m)).unwrap_err(), "corrupt");
        assert_eq!(fs::read(dir.join("bookmarks.json")).unwrap(), b"{ not json");
        fs::write(dir.join("trail.json"), [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(read_data(&dir, "trail").unwrap_err(), "corrupt");
    }

    #[test]
    fn data_version_field_is_required() {
        let dir = temp("data");
        assert_eq!(write_data(&dir, "pins", r#"{"pins":[]}"#, None).unwrap_err(), "bad_request");
        assert_eq!(write_data(&dir, "pins", r#"[1,2]"#, None).unwrap_err(), "bad_request");
        assert!(!dir.join("pins.json").exists());
        fs::write(dir.join("pins.json"), br#"{"version":2,"pins":[]}"#).unwrap();
        assert_eq!(read_data(&dir, "pins").unwrap_err(), "newer");
        let m = stamp_of(&dir.join("pins.json")).unwrap().modified;
        assert_eq!(write_data(&dir, "pins", &data_json("pins"), Some(m)).unwrap_err(), "newer");
        fs::write(dir.join("bookmarks.json"), br#"{"bookmarks":[]}"#).unwrap();
        assert_eq!(read_data(&dir, "bookmarks").unwrap_err(), "corrupt");
    }

    #[test]
    fn only_known_data_files_can_be_used() {
        let dir = temp("data");
        assert_eq!(read_data(&dir, "../state").unwrap_err(), "bad_request");
        assert_eq!(write_data(&dir, "settings", &data_json("x"), None).unwrap_err(), "bad_request");
    }

    #[test]
    fn update_checks_stay_off_until_a_real_key_is_set() {
        assert!(!updater_key_set(None));
        assert!(!updater_key_set(Some("")));
        assert!(!updater_key_set(Some("  ")));
        assert!(!updater_key_set(Some(UPDATER_KEY_PLACEHOLDER)));
        assert!(updater_key_set(Some("dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEFCQ0RFRg==")));
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let key = conf["plugins"]["updater"]["pubkey"].as_str().unwrap_or_default();
        assert!(
            key == UPDATER_KEY_PLACEHOLDER || (key.len() > 40 && key.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'='))),
            "the updater pubkey should be the placeholder or a base64 minisign key"
        );
    }

    #[test]
    fn game_process_detection() {
        assert!(is_game_process("tld.exe", None));
        assert!(is_game_process("TLD.EXE", None));
        assert!(is_game_process("tld", None));
        assert!(is_game_process("TheLongDark", None));
        assert!(is_game_process("tld.x86_64", None));
        assert!(!is_game_process("whiteout", None));
        assert!(!is_game_process("Whiteout.exe", None));
        assert!(!is_game_process("Safari", None));
        assert!(is_game_process("MyGame.exe", Some("mygame")));
        assert!(!is_game_process("MyGame.exe", Some("")));
        assert!(is_game_process("MyGame.x86_64", Some("MyGame.exe")));
    }

    #[test]
    fn steam_libraries_are_read_from_libraryfolders() {
        let vdf = "\"libraryfolders\"\n{\n\t\"0\"\n\t{\n\t\t\"path\"\t\t\"/home/u/.local/share/Steam\"\n\t\t\"label\"\t\t\"\"\n\t}\n\t\"1\"\n\t{\n\t\t\"path\"\t\t\"/mnt/Games Disk/SteamLibrary\"\n\t}\n}\n";
        assert_eq!(steam_library_paths(vdf), vec![PathBuf::from("/home/u/.local/share/Steam"), PathBuf::from("/mnt/Games Disk/SteamLibrary")]);
    }

    #[test]
    fn proton_saves_are_found_in_every_library_with_the_game() {
        let home = temp("home");
        let other = temp("lib");
        let root = home.join(".local").join("share").join("Steam");
        fs::create_dir_all(root.join("steamapps")).unwrap();
        let vdf = format!("\"libraryfolders\"\n{{\n\t\"1\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n}}\n", other.display());
        fs::write(root.join("steamapps").join("libraryfolders.vdf"), vdf).unwrap();
        fs::create_dir_all(other.join("steamapps").join("compatdata").join(TLD_STEAM_APP_ID)).unwrap();
        let dirs = proton_save_dirs(&home);
        assert_eq!(dirs.len(), 1, "only the library that has the game counts: {dirs:?}");
        assert!(dirs[0].starts_with(&other));
        assert!(dirs[0].ends_with(Path::new("LocalLow").join("Hinterland").join("TheLongDark")));
    }

    fn rescue_setup(tag: &str) -> (PathBuf, PathBuf) {
        let root = temp(tag);
        let watched = root.join("TheLongDark").join("Survival");
        fs::create_dir_all(&watched).unwrap();
        (root, watched)
    }

    fn tracking(path: &Path) -> GuardState {
        GuardState { path: Some(path.to_path_buf()), ..GuardState::default() }
    }

    fn rescued_files(watched: &Path) -> Vec<PathBuf> {
        let mut out: Vec<PathBuf> = fs::read_dir(rescue_dir_for(watched))
            .map(|rd| rd.flatten().map(|e| e.path()).collect())
            .unwrap_or_default();
        out.sort();
        out
    }

    #[test]
    fn rescue_stamps_are_readable_dates() {
        assert_eq!(stamp_text(0, 0), "1970-01-01_00-00-00");
        assert_eq!(stamp_text(1793809812000, 0), "2026-11-04_16-30-12");
        assert_eq!(stamp_text(1793809812000, 120), "2026-11-04_18-30-12");
        assert_eq!(stamp_text(1793809812000, -960), "2026-11-04_00-30-12");
        assert_eq!(stamp_text(951782400000, 0), "2000-02-29_00-00-00");
    }

    #[test]
    fn a_vanishing_open_slot_is_copied_to_whiteout_backups_next_to_survival() {
        let (root, watched) = rescue_setup("rescue-basic");
        let slot = watched.join("sandbox1");
        fs::write(&slot, b"alive").unwrap();
        let mut state = tracking(&slot);
        assert_eq!(guard_step(&mut state, &watched, &game_on, 1793809812000).unwrap(), None);
        fs::remove_file(&slot).unwrap();
        let target = guard_step(&mut state, &watched, &game_on, 1793809812000).unwrap().expect("no rescue copy was made");
        assert_eq!(target.parent().unwrap(), root.join("TheLongDark").join("Whiteout-backups"));
        assert_eq!(target.file_name().unwrap().to_string_lossy(), "sandbox1-2026-11-04_16-30-12");
        assert_eq!(fs::read(&target).unwrap(), b"alive");
        assert!(fs::read_dir(&watched).unwrap().next().is_none(), "nothing may be written into the game's save folder");
    }

    #[test]
    fn the_copy_is_the_latest_version_seen_before_the_slot_vanished() {
        let (_root, watched) = rescue_setup("rescue-latest");
        let slot = watched.join("sandbox1");
        let mut state = tracking(&slot);
        fs::write(&slot, b"first").unwrap();
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::write(&slot, b"second, longer").unwrap();
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        let target = guard_step(&mut state, &watched, &game_on, 0).unwrap().unwrap();
        assert_eq!(fs::read(target).unwrap(), b"second, longer");
    }

    #[test]
    fn no_copy_is_made_when_the_game_is_not_running() {
        let (_root, watched) = rescue_setup("rescue-no-game");
        let slot = watched.join("sandbox1");
        fs::write(&slot, b"alive").unwrap();
        let mut state = tracking(&slot);
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        assert_eq!(guard_step(&mut state, &watched, &no_game, 0).unwrap(), None);
        assert!(rescued_files(&watched).is_empty());
    }

    #[test]
    fn a_vanished_slot_is_copied_only_once() {
        let (_root, watched) = rescue_setup("rescue-once");
        let slot = watched.join("sandbox1");
        fs::write(&slot, b"alive").unwrap();
        let mut state = tracking(&slot);
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        assert!(guard_step(&mut state, &watched, &game_on, 0).unwrap().is_some());
        assert_eq!(guard_step(&mut state, &watched, &game_on, 0).unwrap(), None);
        assert_eq!(rescued_files(&watched).len(), 1);
    }

    #[test]
    fn a_slot_that_comes_back_is_tracked_again() {
        let (_root, watched) = rescue_setup("rescue-return");
        let slot = watched.join("sandbox1");
        fs::write(&slot, b"one").unwrap();
        let mut state = tracking(&slot);
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::write(&slot, b"new game").unwrap();
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        let target = guard_step(&mut state, &watched, &game_on, 1000).unwrap().unwrap();
        assert_eq!(fs::read(target).unwrap(), b"new game");
    }

    #[test]
    fn files_outside_the_watched_folder_are_left_alone() {
        let (root, watched) = rescue_setup("rescue-outside");
        let other = root.join("Downloads");
        fs::create_dir_all(&other).unwrap();
        let slot = other.join("sandbox1");
        fs::write(&slot, b"alive").unwrap();
        let mut state = tracking(&slot);
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        assert_eq!(guard_step(&mut state, &watched, &game_on, 0).unwrap(), None);
        assert!(rescued_files(&watched).is_empty());
        assert!(!rescue_dir_for(&watched).exists());
    }

    #[test]
    fn nothing_happens_without_a_tracked_file() {
        let (_root, watched) = rescue_setup("rescue-none");
        let mut state = GuardState::default();
        assert_eq!(guard_step(&mut state, &watched, &game_on, 0).unwrap(), None);
    }

    #[test]
    fn copies_made_in_the_same_second_never_overwrite_each_other() {
        let (_root, watched) = rescue_setup("rescue-same-second");
        let dest = rescue_dir_for(&watched);
        let a = rescue_write(&dest, "sandbox1", b"a", 5000, 0).unwrap();
        let b = rescue_write(&dest, "sandbox1", b"b", 5000, 0).unwrap();
        assert_ne!(a, b);
        assert_eq!(fs::read(a).unwrap(), b"a");
        assert_eq!(fs::read(b).unwrap(), b"b");
    }

    #[test]
    fn a_failed_copy_keeps_the_snapshot_for_the_next_try() {
        let (root, watched) = rescue_setup("rescue-retry");
        let slot = watched.join("sandbox1");
        fs::write(&slot, b"alive").unwrap();
        let mut state = tracking(&slot);
        guard_step(&mut state, &watched, &game_on, 0).unwrap();
        fs::remove_file(&slot).unwrap();
        fs::write(root.join("TheLongDark").join(RESCUE_DIR), b"in the way").unwrap();
        assert!(guard_step(&mut state, &watched, &game_on, 0).is_err());
        assert!(state.snapshot.is_some());
        fs::remove_file(root.join("TheLongDark").join(RESCUE_DIR)).unwrap();
        assert!(guard_step(&mut state, &watched, &game_on, 0).unwrap().is_some());
    }

    #[test]
    fn watcher_reports_changed_files_but_not_our_temp_files() {
        let dir = temp("watch");
        let (tx, rx) = mpsc::channel::<Vec<String>>();
        let _w = start_watcher(&dir, move |names| {
            let _ = tx.send(names);
        })
        .unwrap();
        thread::sleep(Duration::from_millis(300));
        atomic_write(&dir.join("sandbox1"), b"data").unwrap();
        let mut seen = BTreeSet::new();
        let deadline = std::time::Instant::now() + Duration::from_secs(8);
        while std::time::Instant::now() < deadline && !seen.contains("sandbox1") {
            if let Ok(batch) = rx.recv_timeout(Duration::from_millis(500)) {
                seen.extend(batch);
            }
        }
        assert!(seen.contains("sandbox1"), "change was not reported: {seen:?}");
        assert!(seen.iter().all(|n| !is_ours(n)), "temp file leaked into the notification: {seen:?}");
    }
}
