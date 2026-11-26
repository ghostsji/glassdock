# Signing key

`canvas-release.p12` is Canvas's permanent signing key. Android only installs an update if it's
signed with the same key as the installed app, so **this file must never change or be lost**.

It is encrypted (PKCS#12, AES-256) with a long random password that is **not** in this repo.
CI reads the password from the `CANVAS_KEY_PASSWORD` Actions secret. Without it the file is useless,
which is why it's safe to keep here. Keep your own copy of the password somewhere safe.

Certificate SHA-256: 95:9C:1C:66:E1:0E:86:DF:6C:64:C9:87:FC:FB:B7:98:72:36:C6:59:3D:53:3C:17:D8:21:C9:32:2B:55:3F:06
