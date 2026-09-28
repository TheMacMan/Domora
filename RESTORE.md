# Domora – Datensicherung & Wiederherstellung

## Was wird gesichert

| Ebene | Was | Wo | Wann |
|---|---|---|---|
| VM-Snapshots | ganze VM | UGREEN-NAS, Volume 1 | manuell / UGOS |
| **restic** | DB-Snapshot (konsistent), `data/uploads`, `.env.local`, `miete.service` | NAS `//192.168.1.48/Domora-Backup/restic` → OneDrive | täglich 02:15 (Cron) |
| Sicherungen vor Datenänderungen | `data/backups/*.sqlite` | VM | bei Korrekturen, 30 Tage |

- Skript: `scripts/backup.sh` · Log: `~/.local/state/domora-backup.log` · Status: `data/backup-status.json`
  (Einstellungen → „Datensicherung“, Dashboard warnt bei Fehler oder Alter > 2 Tage)
- Aufbewahrung: 14 täglich, 8 wöchentlich, 24 monatlich, 10 jährlich
- Am 1. jedes Monats: `restic check` (10 % Stichprobe) + Test-Wiederherstellung der DB
- Verschlüsselt mit restic. **Schlüssel:** `~/.config/domora/restic.pass` — zusätzlich im Passwort-Manager
  („Domora Backup restic“). Ohne Schlüssel ist die Sicherung nicht lesbar.
- NAS-Freigabe: `/etc/fstab` → `/mnt/domora-backup` (Zugangsdaten `/etc/domora-backup.cred`, nur root)

## Befehle

```bash
export RESTIC_REPOSITORY=/mnt/domora-backup/restic RESTIC_PASSWORD_FILE=~/.config/domora/restic.pass
restic snapshots                      # vorhandene Stände
/opt/miete/app/scripts/backup.sh      # Sicherung jetzt ausführen
FORCE_VERIFY=1 /opt/miete/app/scripts/backup.sh   # inkl. Prüfung + Test-Wiederherstellung
```

## A) Einzelnen Stand zurückholen (z. B. versehentlich gelöschte Daten)

```bash
restic restore <SNAPSHOT-ID> --target /tmp/domora-restore --include /home/vermietie/.cache/domora-backup/db.sqlite
# DB ansehen/vergleichen, dann gezielt übernehmen oder komplett ersetzen:
sudo -n /usr/bin/systemctl stop miete.service    # falls erlaubt, sonst: sudo systemctl stop miete.service
cp data/db.sqlite data/backups/vor-restore-$(date +%F).sqlite
cp /tmp/domora-restore/home/vermietie/.cache/domora-backup/db.sqlite data/db.sqlite && rm -f data/db.sqlite-wal data/db.sqlite-shm
sudo systemctl start miete.service
```

Einzelne Dokumente: `restic restore <ID> --target /tmp/r --include /opt/miete/app/data/uploads/<pfad>`.

## B) Komplett neu aufsetzen (neue VM)

1. Debian installieren, Benutzer `vermietie`, Node 22 (fnm) + pnpm, `sqlite3`, `restic`, `cifs-utils`.
2. NAS-Freigabe einbinden (fstab-Zeile + `/etc/domora-backup.cred` wie oben), restic-Schlüssel aus dem
   Passwort-Manager nach `~/.config/domora/restic.pass` (chmod 600).
3. Code holen: `git clone git@github.com:TheMacMan/Domora.git /opt/miete/app`
4. Daten zurückspielen:
   ```bash
   restic restore latest --target /tmp/r
   mkdir -p /opt/miete/app/data
   cp /tmp/r/home/vermietie/.cache/domora-backup/db.sqlite /opt/miete/app/data/db.sqlite
   cp -a /tmp/r/opt/miete/app/data/uploads /opt/miete/app/data/
   cp /tmp/r/home/vermietie/.cache/domora-backup/env.local /opt/miete/app/.env.local
   sudo cp /tmp/r/home/vermietie/.cache/domora-backup/miete.service /etc/systemd/system/
   ```
5. `cd /opt/miete/app && pnpm install && pnpm build`, dann `sudo systemctl enable --now miete.service`.
6. Prüfen: `sqlite3 data/db.sqlite 'pragma integrity_check;'`, App aufrufen, Cron-Eintrag wieder anlegen:
   `15 2 * * * /opt/miete/app/scripts/backup.sh >> $HOME/.local/state/domora-backup.log 2>&1`
