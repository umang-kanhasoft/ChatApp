import { connectMongo, disconnectMongo } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const seedUsers = [
  {
    username: 'alice',
    email: 'alice@example.com',
    displayName: 'Alice',
    password: 'Password123',
  },
  {
    username: 'bob',
    email: 'bob@example.com',
    displayName: 'Bob',
    password: 'Password123',
  },
];

const run = async () => {
  await connectMongo();

  for (const entry of seedUsers) {
    const exists = await User.findOne({
      $or: [{ email: entry.email }, { username: entry.username }],
    });

    if (exists) continue;

    const passwordHash = await User.hashPassword(entry.password);
    await User.create({
      username: entry.username,
      email: entry.email,
      displayName: entry.displayName,
      passwordHash,
    });
  }

  const users = await User.find().select('_id username email displayName').lean();
  console.log('Seed complete. Users:');
  for (const user of users) {
    console.log(`${user.displayName} (${user.username}) -> ${user._id}`);
  }

  await disconnectMongo();
  process.exit(0);
};

run().catch(async (error) => {
  console.error('Seed failed:', error);
  await disconnectMongo();
  process.exit(1);
});
