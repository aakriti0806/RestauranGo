import { Router, type IRouter } from "express";
import healthRouter from "./health";
import restaurangoRouter from "./restaurango";

const router: IRouter = Router();

router.use(healthRouter);
router.use(restaurangoRouter);

export default router;
