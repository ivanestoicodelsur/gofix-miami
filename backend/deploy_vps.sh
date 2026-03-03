#!/usr/bin/env bash
set -euo pipefail

usage(){
  echo "Usage: $0 -i VPS_IP -u SSH_USER -r REPO_URL -e LOCAL_ENV_PATH [-k SSH_PUB_PATH]"
  exit 1
}

VPS_IP=""
SSH_USER=""
REPO_URL=""
LOCAL_ENV_PATH=""
SSH_PUB_PATH="$HOME/.ssh/id_ed25519.pub"

while getopts ":i:u:r:e:k:" opt; do
  case ${opt} in
    i ) VPS_IP=$OPTARG ;;
    u ) SSH_USER=$OPTARG ;;
    r ) REPO_URL=$OPTARG ;;
    e ) LOCAL_ENV_PATH=$OPTARG ;;
    k ) SSH_PUB_PATH=$OPTARG ;;
    * ) usage ;;
  esac
done

if [[ -z "$VPS_IP" || -z "$SSH_USER" || -z "$REPO_URL" ]]; then
  usage
fi

if [[ -n "$LOCAL_ENV_PATH" && ! -f "$LOCAL_ENV_PATH" ]]; then
  echo "Local .env file not found: $LOCAL_ENV_PATH"
  exit 1
fi

echo "Copying SSH public key ($SSH_PUB_PATH) to $SSH_USER@$VPS_IP (adds to authorized_keys)."
if [[ -f "$SSH_PUB_PATH" ]]; then
  if command -v ssh-copy-id >/dev/null 2>&1; then
    ssh-copy-id -i "$SSH_PUB_PATH" "$SSH_USER@$VPS_IP" || true
  else
    echo "ssh-copy-id not found; attempting manual append."
    PUBKEY=$(cat "$SSH_PUB_PATH")
    ssh "$SSH_USER@$VPS_IP" "mkdir -p ~/.ssh && chmod 700 ~/.ssh && printf '%s\n' '$PUBKEY' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  fi
else
  echo "Public key file not found at $SSH_PUB_PATH. Skipping key copy. You will be prompted for password when connecting."
fi

echo "Installing Docker and prerequisites on VPS. This may ask for your sudo password."
ssh "$SSH_USER@$VPS_IP" bash -s <<'REMOTE'
set -e
if [ -f /etc/debian_version ]; then
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg lsb-release git
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
else
  echo "Non-debian system detected. Please install Docker manually on the VPS and re-run the script."
  exit 1
fi
REMOTE

echo "Preparing application on VPS (clone/pull)."
ssh "$SSH_USER@$VPS_IP" bash -s <<REMOTE
set -e
if [ -d ~/gofix-miami ]; then
  cd ~/gofix-miami && git pull || true
else
  git clone "$REPO_URL" ~/gofix-miami
fi
REMOTE

if [[ -n "$LOCAL_ENV_PATH" ]]; then
  echo "Uploading .env to VPS"
  scp "$LOCAL_ENV_PATH" "$SSH_USER@$VPS_IP:~/gofix-miami/backend/.env"
else
  echo "No local .env provided. You must create ~/gofix-miami/backend/.env on the VPS before starting container."
fi

echo "Building Docker image on VPS"
ssh "$SSH_USER@$VPS_IP" bash -s <<'REMOTE'
set -e
cd ~/gofix-miami/backend
docker build -t gofix-backend:latest .
docker rm -f gofix-backend || true
docker run -d --restart unless-stopped --env-file .env -p 4000:4000 --name gofix-backend gofix-backend:latest
REMOTE

echo "Deployment finished. Follow logs with: ssh $SSH_USER@$VPS_IP 'docker logs -f gofix-backend'"
