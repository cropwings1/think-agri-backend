import bcrypt from "bcryptjs";

async function main() {
  const password = process.argv[2];

  if (!password) {
    console.error('Usage: npm run db:hash-password -- "YourPassword123!"');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  console.log("\nGenerated password hash:\n");
  console.log(hash);
}

main().catch((error) => {
  console.error("Failed to generate password hash:", error);
  process.exit(1);
});
