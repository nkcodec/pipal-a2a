import express, { Request, Response } from "express";

const app = express();
const PORT: number = 3000;

app.get("/", (_req: Request, res: Response): void => {
  res.send("Hello, World!");
});

app.listen(PORT, (): void => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
