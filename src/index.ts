import "dotenv/config";
import "./timezone.js";
import { buildApp } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;

const app = buildApp();

app.listen(PORT, () => {
  console.log(`Daily Dashboard: http://127.0.0.1:${PORT}`);
});
