#!/usr/bin/env python3
"""outlook_calendar_bridge.py — Native 2-way sync: calendar-api <-> Outlook desktop accounts.

QNFO.OPS.010 follow-on (2026-09-03). User request: QNFO + Personal calendars must be
viewable AND editable in Outlook on a Huawei Android phone. ICS subscriptions are
read-only on every client, so this bridge mirrors calendar-api events as NATIVE
Outlook appointment items inside dedicated calendar folders of the cloud-backed
Outlook.com accounts. Native items sync to Outlook mobile (cloud-backed), where the
user edits them; the bridge pulls those edits back into calendar-api (D1 qnfo-audit),
which regenerates the published ICS feeds.

Mapping (user-confirmed 2026-09-03):
  plane=qnfo     -> rowan.quni@outlook.com store, folder "QNFO Research Calendar"
  plane=personal -> rwnquni@outlook.com store, folder "Personal Calendar"

Only items inside the dedicated folder are ever touched. Items are tagged with an
invisible MAPI named property QNFO_UID=<calendar-api uid> so reconciliation is stable
across runs. State (last-seen uids + canonical signatures) is persisted to a local
JSON so deletes/edits made on the phone can be propagated without touching pre-bridge
data.

Directions:
  API -> Outlook : every calendar-api event is upserted into the folder (create/update)
                   when the Outlook item's canonical fields differ from the API event.
  Outlook -> API : (a) untagged items in the folder (created on the phone) are POSTed
                   and tagged; (b) tagged items whose canonical fields changed since
                   last run are PUT back; (c) tagged items present last run but gone
                   now are treated as phone-deletes and DELETE the calendar-api event.

Canonical signature = sha1 of {title, location, start, end, all_day} rendered in a
single representation shared by API events and Outlook items (body and marker are
excluded), so an unchanged item never produces a false diff.

Usage:
  python outlook_calendar_bridge.py [--plane qnfo|personal|all] [--dry-run]
    default: all planes, live, both directions.
Exit codes: 0 ok, 2 Outlook unavailable, 3 unexpected error.
"""
import sys, json, hashlib, datetime, argparse, os, urllib.request

API = "https://calendar-api.q08.workers.dev"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
# Auth (calendar-api v0.3.0 gate, 2026-09-03): read CAL_TOKEN from env or calendar-token.txt next to
# this script. Without a token the API rejects with 401 - the bridge will error clearly.
TOKEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calendar-token.txt")
PLANES = {
    "qnfo":     {"store_prefix": "rowan.quni@outlook.com", "folder": "QNFO Research Calendar"},
    "personal": {"store_prefix": "rwnquni@outlook.com",    "folder": "Personal Calendar"},
}
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bridge_state.json")

def log(*a):
    print(*a, flush=True)

def _token():
    t = os.environ.get("CAL_TOKEN") or ""
    if not t:
        try:
            with open(TOKEN_FILE, "r", encoding="utf-8") as f:
                t = f.read().strip()
        except Exception:
            t = ""
    return t

def http_json(url, method="GET", body=None):
    headers = {"User-Agent": UA}
    tok = _token()
    if tok:
        headers["Authorization"] = "Bearer " + tok
    req = urllib.request.Request(url, method=method, headers=headers)
    if body is not None:
        req.add_header("Content-Type", "application/json")
        req.data = json.dumps(body).encode()
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())

def api_events(plane):
    return http_json(API + "/events?plane=" + plane).get("events", [])

def api_post(plane, ev):
    return http_json(API + "/events?plane=" + plane, "POST", {
        "title": ev.get("title"), "description": ev.get("description"),
        "location": ev.get("location"), "dtstart": ev.get("dtstart"),
        "dtend": ev.get("dtend"), "all_day": ev.get("all_day", 0),
        "url": ev.get("url"), "source": "manual", "status": ev.get("status") or "confirmed",
    })

def api_put(plane, eid, ev):
    body = {k: ev.get(k) for k in ("title","description","location","dtstart","dtend","all_day","url","status") if k in ev}
    return http_json(API + "/events/" + str(eid) + "?plane=" + plane, "PUT", body)

def api_delete(plane, eid):
    return http_json(API + "/events/" + str(eid) + "?plane=" + plane, "DELETE")

def state_load():
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def state_save(st):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=2, default=str)

def outlook():
    import win32com.client
    return win32com.client.Dispatch("Outlook.Application")

def find_store(ns, prefix):
    for st in ns.Stores:
        if st.DisplayName.lower().startswith(prefix.lower()):
            return st
    return None

def ensure_folder(store, name):
    root = store.GetRootFolder()
    for f in root.Folders:
        if f.Name == name:
            return f, False
    f = root.Folders.Add(name, 9)  # 9 = olFolderCalendar
    return f, True

def tag_uid(item, uid):
    ns = "http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/QNFO_UID"
    try:
        item.PropertyAccessor.SetProperty(ns, uid)
    except Exception:
        pass
    try:
        body = str(item.Body or "")
        marker = "X-QNFO-UID: " + uid
        if marker not in body:
            item.Body = (marker + "\n" + body).strip() if body else marker
    except Exception:
        pass
    try:
        item.Save()
    except Exception:
        pass

def get_uid(item):
    ns = "http://schemas.microsoft.com/mapi/string/{00020329-0000-0000-C000-000000000046}/QNFO_UID"
    try:
        v = item.PropertyAccessor.GetProperty(ns)
        if v:
            return str(v)
    except Exception:
        pass
    try:
        for line in str(item.Body or "").splitlines():
            if line.startswith("X-QNFO-UID:"):
                return line.split(":", 1)[1].strip()
    except Exception:
        pass
    return None

def naive(dt):
    """pywin32 COM datetime -> naive local datetime."""
    if dt is None:
        return None
    if isinstance(dt, datetime.datetime):
        if dt.tzinfo is not None:
            return dt.astimezone().replace(tzinfo=None)
        return dt
    # pywintypes.Time subclass of datetime
    try:
        return datetime.datetime(dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
    except Exception:
        return None

def dt_to_outlook(dtstr):
    if not dtstr:
        return None
    dtstr = str(dtstr)
    if "T" not in dtstr:
        return datetime.datetime.strptime(dtstr[:10], "%Y-%m-%d")
    try:
        iso = dtstr.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(iso)
        return dt.astimezone().replace(tzinfo=None)
    except Exception:
        return None

def api_canon(ev):
    """Canonical Outlook-equivalent fields for an API event dict."""
    all_day = bool(ev.get("all_day")) or ("T" not in str(ev.get("dtstart") or ""))
    start = dt_to_outlook(ev.get("dtstart"))
    end = dt_to_outlook(ev.get("dtend"))
    if all_day:
        if end is None or end.date() <= start.date():
            end = start + datetime.timedelta(days=1)
    else:
        end = end or (start + datetime.timedelta(hours=1))
    return {
        "title": str(ev.get("title") or "").strip(),
        "location": str(ev.get("location") or "").strip(),
        "start": start.strftime("%Y-%m-%d" if all_day else "%Y-%m-%d %H:%M"),
        "end": end.strftime("%Y-%m-%d" if all_day else "%Y-%m-%d %H:%M"),
        "all_day": bool(all_day),
    }

def item_canon(it):
    all_day = bool(getattr(it, "AllDayEvent", False))
    s = naive(it.Start); e = naive(it.End)
    if all_day:
        if e is None or (s is not None and e.date() <= s.date()):
            e = s + datetime.timedelta(days=1) if s else e
    return {
        "title": str(it.Subject or "").strip(),
        "location": str(it.Location or "").strip(),
        "start": s.strftime("%Y-%m-%d" if all_day else "%Y-%m-%d %H:%M") if s else None,
        "end": e.strftime("%Y-%m-%d" if all_day else "%Y-%m-%d %H:%M") if e else None,
        "all_day": bool(all_day),
    }

def sig(canon):
    return hashlib.sha1(json.dumps(canon, sort_keys=True).encode()).hexdigest()

def apply_event_to_item(item, ev):
    all_day = bool(ev.get("all_day")) or ("T" not in str(ev.get("dtstart") or ""))
    start = dt_to_outlook(ev.get("dtstart"))
    end = dt_to_outlook(ev.get("dtend"))
    if all_day:
        item.AllDayEvent = True
        if end is None or end.date() <= start.date():
            end = start + datetime.timedelta(days=1)
        item.Start = start
        item.End = end
    else:
        item.AllDayEvent = False
        item.Start = start
        item.End = end or (start + datetime.timedelta(hours=1))
    item.Subject = str(ev.get("title") or "(untitled)")
    item.Location = str(ev.get("location") or "")
    desc = str(ev.get("description") or "").strip()
    url = str(ev.get("url") or "").strip()
    parts = []
    if desc:
        parts.append(desc)
    if url:
        parts.append("URL: " + url)
    parts.append("X-QNFO-UID: " + str(ev.get("uid") or ""))
    try:
        item.Body = "\n".join(parts)
    except Exception:
        pass
    try:
        item.Save()
    except Exception:
        pass

def find_item_by_uid(folder, uid):
    for it in folder.Items:
        try:
            if get_uid(it) == uid:
                return it
        except Exception:
            continue
    return None

def index_folder(folder):
    by_uid = {}
    untagged = []
    for it in folder.Items:
        try:
            u = get_uid(it)
        except Exception:
            u = None
        if u:
            by_uid[u] = it
        else:
            untagged.append(it)
    return by_uid, untagged

def item_to_api_fields(it):
    all_day = bool(it.AllDayEvent)
    s = naive(it.Start); e = naive(it.End)
    def fmt(dt):
        if dt is None:
            return None
        return dt.date().isoformat() if all_day else dt.isoformat(sep=" ")
    return {
        "title": str(it.Subject or "").strip(),
        "location": str(it.Location or "").strip() or None,
        "dtstart": fmt(s),
        "dtend": fmt(e),
        "all_day": 1 if all_day else 0,
        "status": "confirmed",
    }

def sync_plane(plane, args, st):
    cfg = PLANES[plane]
    api_evs = api_events(plane)
    api_by_uid = {e.get("uid"): e for e in api_evs if e.get("uid")}
    api_id_by_uid = {e.get("uid"): e.get("id") for e in api_evs if e.get("uid")}

    app = outlook()
    ns = app.GetNamespace("MAPI")
    store = find_store(ns, cfg["store_prefix"])
    if store is None:
        log("ERROR: store not found for " + cfg["store_prefix"])
        return {"plane": plane, "error": "store missing"}
    folder, created = ensure_folder(store, cfg["folder"])
    if created:
        log("created folder " + cfg["folder"] + " in " + store.DisplayName)

    by_uid, untagged = index_folder(folder)
    st.setdefault(plane, {})
    pst = st[plane]
    # UIDs that existed in the folder at the END of the previous run (state persisted).
    # Only these may be considered for delete-propagation: a phone delete removes an item
    # that the bridge had already created and seen. UIDs created THIS run are excluded.
    prior_known = set(u for u, v in pst.items() if v.get("seen"))
    created_items = updated_items = deleted_events = posted_events = pulled_edits = 0
    errors = []

    if not args.dry_run:
        # 0) DELETE DETECTION FIRST (phone deletes): a uid known from a previous run
        # (prior_known) that is absent from the CURRENT folder index was deleted by the
        # user on the phone/Outlook -> propagate to calendar-api and remove from the
        # upsert set so step 1 does not recreate it. (Ordering fix 2026-09-03: this ran
        # after the upsert before, so step 1 recreated the item and the delete never fired.)
        for uid in list(prior_known):
            if uid not in by_uid and uid not in untagged_uids:
                if uid in api_id_by_uid:
                    try:
                        api_delete(plane, api_id_by_uid[uid])
                        deleted_events += 1
                    except Exception as e:
                        errors.append("delete:" + repr(e))
                    api_by_uid.pop(uid, None)
                    api_id_by_uid.pop(uid, None)
                if uid in pst:
                    del pst[uid]

        # 1) API -> Outlook upsert (over the remaining api rows)
        for uid, ev in api_by_uid.items():
            item = by_uid.get(uid) or find_item_by_uid(folder, uid)
            c = api_canon(ev); csig = sig(c)
            if item is None:
                it = folder.Items.Add(1)  # olAppointmentItem
                apply_event_to_item(it, ev)
                tag_uid(it, uid)
                created_items += 1
                pst[uid] = {"sig": csig, "seen": True}
            else:
                prev = pst.get(uid, {})
                # Update API->Outlook ONLY when the API canonical changed since the last
                # sync (prev sig != current API sig). If the API sig is unchanged but the
                # live item differs, that is a phone-side edit and step 3 pulls it back
                # (Outlook->API). Never overwrite a phone edit with stale API content.
                if prev.get("sig") != csig or not prev.get("seen"):
                    apply_event_to_item(item, ev)
                    tag_uid(item, uid)
                    updated_items += 1
                    pst[uid] = {"sig": csig, "seen": True}
                else:
                    pst[uid]["seen"] = True

        # 2) untagged folder items (phone-created) -> POST + tag
        for it in untagged:
            try:
                subject = str(it.Subject or "").strip()
                if not subject or subject.startswith("X-QNFO-UID"):
                    continue
                f = item_to_api_fields(it)
                ev = dict(f); ev["description"] = None; ev["url"] = None
                r = api_post(plane, ev)
                uid = r.get("uid")
                if uid:
                    tag_uid(it, uid)
                    pst[uid] = {"sig": sig(api_canon(ev)), "seen": True}
                    posted_events += 1
            except Exception as e:
                errors.append("untagged:" + repr(e))

        # 3) tagged items whose live canonical differs from last-known sig -> PUT back
        for uid, it in by_uid.items():
            prev = pst.get(uid, {})
            if not prev.get("seen"):
                continue
            try:
                ev = api_by_uid.get(uid)
                if ev is None:
                    continue
                live = item_canon(it); live_sig = sig(live)
                if prev.get("sig") != live_sig:
                    upd = item_to_api_fields(it)
                    api_put(plane, api_id_by_uid[uid], upd)
                    pst[uid] = {"sig": live_sig, "seen": True}
                    pulled_edits += 1
            except Exception as e:
                errors.append("pull:" + repr(e))

        # 4) deletes: only for items KNOWN from a previous run (prior_known) that are
        # gone from a FRESH folder index. Re-index AFTER all create/update so just-created
        # items are never misread as phone-deletes (bug fixed 2026-09-03: the delete pass
        # previously ran against the pre-creation by_uid and deleted every API event).
        fresh_by_uid, _ = index_folder(folder)
        for uid in list(pst.keys()):
            if uid not in prior_known:
                # never seen before this run (either brand-new api event or phone-created
                # item posted this run) -> cannot be a phone-delete yet
                continue
            if uid in fresh_by_uid:
                continue  # still present
            if uid in api_id_by_uid:
                try:
                    api_delete(plane, api_id_by_uid[uid])
                    deleted_events += 1
                except Exception as e:
                    errors.append("delete:" + repr(e))
            if uid in pst:
                del pst[uid]

        # refresh the fresh index for the seen baseline at the end of the run
        final_by_uid, _ = index_folder(folder)
        for uid in list(pst.keys()):
            if uid in final_by_uid or uid in api_by_uid:
                pst[uid]["seen"] = True
            else:
                pst[uid]["seen"] = False

    result = {
        "plane": plane, "folder": cfg["folder"], "api_events": len(api_evs),
        "folder_items": len(by_uid) + len(untagged),
        "created_items": created_items, "updated_items": updated_items,
        "deleted_events": deleted_events, "posted_events": posted_events,
        "pulled_edits": pulled_edits, "errors": errors[:5],
    }
    log(json.dumps(result))
    return result

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plane", choices=["qnfo", "personal", "all"], default="all")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--push-api", dest="push_api", action="store_true", default=True)
    ap.add_argument("--no-push-api", dest="push_api", action="store_false")
    args = ap.parse_args()
    planes = ["qnfo", "personal"] if args.plane == "all" else [args.plane]
    st = state_load()
    total = {"created": 0, "updated": 0, "deleted": 0, "posted": 0, "pulled": 0, "errors": 0}
    try:
        for pl in planes:
            r = sync_plane(pl, args, st)
            if "error" in r:
                total["errors"] += 1
                continue
            total["created"] += r["created_items"]; total["updated"] += r["updated_items"]
            total["deleted"] += r["deleted_events"]; total["posted"] += r["posted_events"]
            total["pulled"] += r["pulled_edits"]; total["errors"] += len(r["errors"])
        state_save(st)
        log("TOTAL " + json.dumps(total))
    except Exception as e:
        log("FATAL " + repr(e))
        sys.exit(3)

if __name__ == "__main__":
    main()
