const fs = require('fs');

const snapshot = JSON.parse(fs.readFileSync('drizzle/meta/0006_snapshot.json', 'utf8'));

// Update snapshot metadata
snapshot.id = 'c0a1b2c3-d4e5-6f78-9abc-def012345678';
snapshot.prevId = '000bfcd5-fd27-4bdf-9855-35f6cffed095';

// Add new columns to account table
snapshot.tables.account.columns.scopes = {
  name: 'scopes',
  type: 'text',
  primaryKey: false,
  notNull: false,
  autoincrement: false
};

snapshot.tables.account.columns.token_type = {
  name: 'token_type',
  type: 'text',
  primaryKey: false,
  notNull: false,
  autoincrement: false
};

// Add user_email_unique index to user table
if (!snapshot.tables.user.indexes) {
  snapshot.tables.user.indexes = {};
}

snapshot.tables.user.indexes['user_email_unique'] = {
  name: 'user_email_unique',
  columns: ['email'],
  isUnique: true
};

fs.writeFileSync('drizzle/meta/0007_snapshot.json', JSON.stringify(snapshot, null, 2));
console.log('Created 0007_snapshot.json');
