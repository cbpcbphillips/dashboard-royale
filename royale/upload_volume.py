"""Upload every parquet file in data/manifest.json to the raw Volume, keeping folders.

Idempotent: skips files whose size already matches. Run: uv run python -m royale.upload_volume
"""
from royale import dbx, targets


def main():
    w = dbx.client()
    root = targets.volume_root()
    entries = targets.parquet_entries()
    for i, e in enumerate(entries, 1):
        remote = f"{root}/{e['path']}"
        try:
            meta = w.files.get_metadata(remote)
            if meta.content_length == e["bytes"]:
                print(f"[{i}/{len(entries)}] skip (same size) {e['path']}")
                continue
        except Exception:
            pass
        with open(targets.DATA / e["path"], "rb") as fh:
            w.files.upload(remote, fh, overwrite=True)
        print(f"[{i}/{len(entries)}] uploaded {e['path']} ({e['bytes'] / 1e6:.1f} MB)")

    bad = []
    for e in entries:
        size = w.files.get_metadata(f"{root}/{e['path']}").content_length
        if size != e["bytes"]:
            bad.append((e["path"], size, e["bytes"]))
    print(f"verified {len(entries) - len(bad)}/{len(entries)} file sizes" + (f"; MISMATCH {bad}" if bad else ""))


if __name__ == "__main__":
    main()
