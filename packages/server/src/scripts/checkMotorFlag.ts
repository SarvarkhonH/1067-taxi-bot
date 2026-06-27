import "../env";
import { prisma } from "../db";
(async () => {
  const g = await prisma.appState.findUnique({ where: { key: "feature:garajx" } });
  const f = await prisma.appState.findUnique({ where: { key: "feature:motorolami" } });
  const ec = await prisma.appState.findUnique({ where: { key: "mo:econ" } });
  console.log("PROD garajx flag:", g?.value ?? "(unset → DEFAULT OFF)");
  console.log("PROD motorolami flag:", f?.value ?? "(unset → DEFAULT OFF)");
  console.log("PROD mo:econ:", ec?.value ?? "(unset → defaults)");
  await prisma.$disconnect();
})();
