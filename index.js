export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  return res.status(200).json({
    status: 'online',
    service: 'LinkWala Cloud API',
    endpoints: {
      videos: '/videos',
      verifyChannel: '/verify-channel',
      webhook: '/telegram-webhook',
    },
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
}
