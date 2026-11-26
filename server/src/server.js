const app = require('./app');
const config = require('./config');

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Admin server listening on http://127.0.0.1:${config.port}`);
});
