import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

dotenv.config();

const prisma = new PrismaClient();

async function run() {
  const users = [
    {
      email: 'admin@gofix.com',
      password: 'admin123',
      name: 'Admin',
      role: 'ADMIN' as const,
    },
    {
      email: 'tech@gofix.com',
      password: 'tech123',
      name: 'Technician',
      role: 'TECHNICIAN' as const,
    },
    {
      email: 'viewer@gofix.com',
      password: 'viewer123',
      name: 'Viewer',
      role: 'VIEWER' as const,
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { password: hash, name: u.name, role: u.role },
      create: { email: u.email, password: hash, name: u.name, role: u.role },
    });
  }

  // Backward compatible: allow overriding admin credentials via env
  const envEmail = process.env.ADMIN_EMAIL;
  const envPassword = process.env.ADMIN_PASSWORD;
  const envName = process.env.ADMIN_NAME || 'Admin';
  if (envEmail && envPassword) {
    const hash = await bcrypt.hash(envPassword, 10);
    await prisma.user.upsert({
      where: { email: envEmail },
      update: { password: hash, name: envName, role: 'ADMIN' },
      create: { email: envEmail, password: hash, name: envName, role: 'ADMIN' },
    });
  }

  console.log('Seed complete: admin@gofix.com, tech@gofix.com, viewer@gofix.com');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
