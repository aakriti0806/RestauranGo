import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
const allowedOrigins = new Set(
  [process.env.FRONTEND_ORIGIN, process.env.REPLIT_DEV_DOMAIN, process.env.REPLIT_DOMAINS]
    .filter(Boolean)
    .flatMap((value) => value?.split(",") ?? []),
);
app.use(cors({
  credentials: true,
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.size === 0 || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed."));
  },
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err: error }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ error: "The kitchen is having trouble. Please try again." });
});

export default app;
