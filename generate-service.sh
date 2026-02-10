
#!/bin/bash
# Dieses Skript generiert die passende systemd-Konfiguration für diesen Server

USER=$(whoami)
WORKDIR=$(pwd)
NODE_PATH=$(which node)

echo "--- KOPIERE DIESEN INHALT IN DEINE DATEI /etc/systemd/system/powerlog.service ---"
echo ""
cat <<EOF
[Unit]
Description=PowerLog Battery Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$WORKDIR
ExecStart=$NODE_PATH server.js
Restart=on-failure
Environment=PORT=3030

[Install]
WantedBy=multi-user.target
EOF
echo ""
echo "--- ENDE DER DATEI ---"
echo ""
echo "Danach ausführen:"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl restart powerlog"
