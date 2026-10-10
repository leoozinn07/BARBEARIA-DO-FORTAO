// Gera o par de chaves VAPID para as notificações push. Cole o resultado no .env.
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLICA=${publicKey}\nVAPID_PRIVADA=${privateKey}`);
