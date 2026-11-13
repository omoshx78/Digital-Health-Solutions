import "dotenv/config";
import app from "../src/app";

// Vercel serverless entry: Vercel calls the exported Express app per request.
export default app;
