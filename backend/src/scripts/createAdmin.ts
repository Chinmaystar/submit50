/** Promote (or create) an admin user: npm run create-admin -- admin@acmvnit.org "Full Name" */
import { connectMongo, disconnectMongo } from "../config/db.js";
import { User } from "../models/User.js";

async function main(): Promise<void> {
  const [email, name] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    console.error("Usage: npm run create-admin -- <email> [name]");
    process.exit(1);
  }
  await connectMongo();
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { role: "ADMIN", name: name ?? email.split("@")[0] } },
    { upsert: true, new: true }
  );
  console.log(`Admin ready: ${user!.email} (${user!.role})`);
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
