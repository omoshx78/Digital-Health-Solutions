import "dotenv/config";
import app from "./app";

// Long-running server entry (Render, Railway, Docker, local dev).
// On Vercel this file is not used — see api/index.ts.
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`DHS API listening on port ${port}`));
