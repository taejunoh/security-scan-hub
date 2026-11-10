"""Run offline with: python test/prepare-codex-windows-plugin.test.py <official 0.7.0 tgz>."""

import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path


HELPER = Path(__file__).resolve().parents[1] / "scripts" / "prepare-codex-windows-plugin.py"
PREFIX = "package/_bundled_plugin/"
READER = "scripts/workbench_db.py"
READ_FIXTURE = """
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from workbench_db import read_json_object
print(json.dumps(read_json_object(Path(sys.argv[2]))))
"""


def prepare(archive, output):
    return subprocess.run(
        [sys.executable, "-B", str(HELPER), str(archive), str(output)],
        capture_output=True, text=True, check=False,
    )


def main(archive):
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory).resolve()
        output = root / "private plugin"
        prepared = prepare(archive, output)
        assert prepared.returncode == 0, prepared.stderr
        plugin = output / "plugin"
        assert Path(prepared.stdout.strip()) == plugin
        provenance = json.loads((output / "provenance.json").read_bytes())
        with tarfile.open(archive) as package:
            original = {
                member.name.removeprefix(PREFIX): package.extractfile(member).read()
                for member in package
                if member.isfile() and member.name.startswith(PREFIX)
            }
        generated = {
            file.relative_to(plugin).as_posix(): file.read_bytes()
            for file in plugin.rglob("*")
            if file.is_file()
        }
        assert original.keys() == generated.keys()
        assert [path for path in original if original[path] != generated[path]] == [READER]
        assert hashlib.sha256(original[READER]).hexdigest() == provenance["upstreamSha256"]
        assert hashlib.sha256(generated[READER]).hexdigest() == provenance["overlaySha256"]

        stock = root / "stock plugin"
        shutil.copytree(plugin, stock)
        (stock / READER).write_bytes(original[READER])
        manifest = root / "scan-manifest.json"
        bom = bytes.fromhex("efbbbf")
        valid = b'{"scan":{"id":"offline-fixture"}}'
        for payload, stock_ok, overlay_ok in [
            (valid, True, True),
            (bom + valid, False, True),
            (bom + b'{"scan":}', False, False),
            (bom + b'{"scan":NaN}', False, False),
            (bom + b"[]", False, False),
            (bom + bom + valid, False, False),
            (bom + b'{"scan":"\xff"}', False, False),
        ]:
            manifest.write_bytes(payload)
            for copy, expected in [(stock, stock_ok), (plugin, overlay_ok)]:
                result = subprocess.run(
                    [sys.executable, "-I", "-B", "-c", READ_FIXTURE, str(copy / "scripts"), str(manifest)],
                    capture_output=True, text=True, check=False,
                )
                assert (result.returncode == 0) == expected, (payload, result.stderr)
                if expected:
                    assert json.loads(result.stdout) == {"scan": {"id": "offline-fixture"}}

        tampered = root / "tampered.tgz"
        tampered.write_bytes(archive.read_bytes() + b"changed")
        rejected = root / "rejected"
        assert "Archive integrity mismatch" in prepare(tampered, rejected).stderr
        assert not rejected.exists()
        assert prepare(archive, output).returncode == 1
        assert (plugin / READER).read_bytes() == generated[READER]
        alias = root / "alias"
        try:
            alias.symlink_to(plugin, target_is_directory=True)
        except OSError:
            if sys.platform != "win32":
                raise
            print("Linked parent check skipped. This Windows user cannot create a symlink.")
        else:
            assert prepare(archive, alias / "nested").returncode == 1
            assert not (plugin / "nested").exists()
        print(f"{len(generated)} pinned files checked, one decoder changed, safe reader and preparation checks passed.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
