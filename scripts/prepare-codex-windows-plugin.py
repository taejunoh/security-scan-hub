"""Prepare a separate Codex Security 0.7.0 plugin for Windows manifest decoding."""

import argparse
import base64
import hashlib
import io
import json
import shutil
import stat
import sys
import tarfile
from pathlib import Path


VERSION = "0.7.0"
ARCHIVE_INTEGRITY = (
    "sha512-N8BZ6JyfAWGKwzAdBdIX5AjlsZobXORY15CQ3zMFBQk4CBY9ue4kwnyf+6SdSPaZPHXsWnsuMYZcElMhZBaHPg=="
)
PREFIX = "package/_bundled_plugin/"
READER = "scripts/workbench_db.py"
READER_BEFORE = "1907b739c02bed30f49185272ca45734903212e18e2d8efa2ab0c42eb53c5a41"
READER_AFTER = "a33a47c45272a926a1954644e23e9b5fdcc06618ec0328eb35aa41204e43fb41"
OLD = b'path.read_text(encoding="utf-8"),\n            parse_constant=reject_non_finite_json,'
NEW = OLD.replace(b'"utf-8"', b'"utf-8-sig"')
# The caller selects a private Windows parent. Inherit its ACL instead of
# asking Python to replace it with the special Windows 0700 descriptor.
DIRECTORY_MODE = 0o777 if sys.platform == "win32" else 0o700


def safe_parent(path):
    for parent in (path, *path.parents):
        metadata = parent.lstat()
        reparse = getattr(metadata, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT
        if not stat.S_ISDIR(metadata.st_mode) or reparse:
            raise ValueError(f"Output parent must be a real directory: {parent}")


def copy_plugin(package, plugin):
    with tarfile.open(fileobj=io.BytesIO(package), mode="r:gz") as archive:
        for member in archive:
            if not member.name.startswith(PREFIX):
                continue
            relative = member.name.removeprefix(PREFIX)
            parts = relative.split("/")
            if any(part in {"", ".", ".."} or "\\" in part or ":" in part for part in parts):
                raise ValueError(f"Invalid archive member: {member.name}")
            destination = plugin.joinpath(*parts)
            if member.isdir():
                destination.mkdir(parents=True, exist_ok=True, mode=DIRECTORY_MODE)
                continue
            if not member.isfile():
                raise ValueError(f"Unsupported archive member: {member.name}")
            destination.parent.mkdir(parents=True, exist_ok=True, mode=DIRECTORY_MODE)
            with archive.extractfile(member) as source, destination.open("xb") as output:
                shutil.copyfileobj(source, output)
            destination.chmod(0o700 if member.mode & 0o111 else 0o600)


def prepare(archive, output):
    if not output.is_absolute() or ".." in output.parts:
        raise ValueError("Choose an absolute output directory without parent traversal.")
    safe_parent(output.parent)
    with archive.open("rb") as source:
        package = source.read(16 * 1024 * 1024)
        if source.read(1):
            raise ValueError("Archive exceeds the expected size.")
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(package).digest()).decode("ascii")
    if integrity != ARCHIVE_INTEGRITY:
        raise ValueError(f"Archive integrity mismatch for @openai/codex-security@{VERSION}.")

    output.mkdir(mode=DIRECTORY_MODE)
    plugin = output / "plugin"
    try:
        plugin.mkdir(mode=DIRECTORY_MODE)
        copy_plugin(package, plugin)
        reader = plugin / READER
        original = reader.read_bytes()
        if hashlib.sha256(original).hexdigest() != READER_BEFORE or original.count(OLD) != 1:
            raise ValueError("Unexpected upstream JSON reader.")
        modified = original.replace(OLD, NEW, 1)
        if hashlib.sha256(modified).hexdigest() != READER_AFTER:
            raise ValueError("Unexpected patched JSON reader.")
        reader.write_bytes(modified)
        (output / "provenance.json").write_text(json.dumps({
            "package": f"@openai/codex-security@{VERSION}",
            "archiveIntegrity": integrity,
            "pluginPath": "plugin",
            "changedFile": READER,
            "upstreamSha256": READER_BEFORE,
            "overlaySha256": READER_AFTER,
        }, indent=2) + "\n", encoding="utf-8")
    except BaseException:
        shutil.rmtree(output)
        raise
    return plugin


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Official 0.7.0 npm archive from npm pack")
    parser.add_argument("output", type=Path, help="New absolute directory under a private parent")
    options = parser.parse_args()
    try:
        print(prepare(options.archive, options.output))
    except (OSError, ValueError, tarfile.TarError) as exc:
        parser.exit(1, f"{exc}\n")


if __name__ == "__main__":
    main()
