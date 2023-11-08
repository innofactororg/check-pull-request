#!/usr/bin/env sh
if [ -d "/var/run/docker.sock" ]; then
  # Grant access to the docker socket
  sudo chmod 666 /var/run/docker.sock
fi

if ! [ -d ~/.ssh ]; then
  if [ -d /tmp/.ssh-localhost ]; then
    command mkdir -p -- ~/.ssh
    sudo cp -R /tmp/.ssh-localhost/* ~/.ssh
    sudo chown -R $(whoami):$(whoami) ~ || true ?>/dev/null
    sudo chmod 400 ~/.ssh/*
  fi
fi

sudo apt-get update
sudo apt-get install --no-install-recommends -y pre-commit fonts-firacode shellcheck
sudo npm install -g npm prettier

if [ -f ~/.gitconfig ]; then
  rm ~/.gitconfig
fi

if ! [ -d ~/.config ]; then
  command mkdir -p -- ~/.config
fi
/bin/cp -f .devcontainer/starship.toml ~/.config/starship.toml
chown -R $USER_UID:$USER_GID ~/.config
chmod -R 700 ~/.config
chown $USER_UID:$USER_GID ~/.config/starship.toml
if ! [ -f ~/.zshrc ]; then
  touch ~/.zshrc
fi
if ! grep -q 'eval "$(starship init zsh)"' ~/.zshrc; then
  echo 'eval "$(starship init zsh)"' >>~/.zshrc
fi
