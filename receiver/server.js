const express = require('express');

const app = express();
const PORT = 4001;

app.use(express.static('.'));

app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
