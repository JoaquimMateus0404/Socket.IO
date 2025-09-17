# Railway Deploy Guide

## 1. Prepare o projeto
# Adicione este script no package.json
"scripts": {
  "start": "node server.js",
  "build": "echo 'No build needed'"
}

## 2. Crie arquivo railway.json (opcional)
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/status"
  }
}

## 3. Deploy
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up

## 4. Configure variáveis de ambiente
# No dashboard do Railway, adicione:
PORT=3001

## 5. Seu WebSocket estará disponível em:
wss://sua-app.railway.app/ws
