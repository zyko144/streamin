// Stockage local du bot (tickets en cours, compteurs de boosts...).
// Le disque Render n'est pas persistant entre deploiements : si tu veux que
// ces donnees survivent aux redeploiements, cree une table Supabase
// `bot_data (id text primary key, data jsonb, updated_at timestamptz)` et
// definis SUPABASE_URL/SUPABASE_KEY (avec une policy qui autorise la cle
// utilisee a lire/ecrire cette table) ; sinon le bot utilise db.json en local.

const fs = require('fs');
const path = require('path');

const LOCAL_PATH = path.join(__dirname, '..', 'db.json');
const TABLE = 'bot_data';
const ROW_ID = 'streamin_bot';

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
  const { createClient } = require('@supabase/supabase-js');
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
}

let cache = null;

function readLocalFile() {
  if (!fs.existsSync(LOCAL_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function initDatabase() {
  if (!supabase) {
    console.log('ℹ️  SUPABASE_URL/SUPABASE_KEY absents : stockage local (db.json).');
    cache = readLocalFile();
    return cache;
  }
  const { data, error } = await supabase.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
  if (error) {
    console.error('⚠️  Impossible de charger la base Supabase, repli sur le fichier local:', error.message);
    cache = readLocalFile();
    return cache;
  }
  cache = data?.data ?? {};
  console.log('✅ Base de données du bot chargée depuis Supabase.');
  return cache;
}

function readDatabase() {
  if (cache === null) cache = readLocalFile();
  return cache;
}

function writeDatabase(db) {
  cache = db;
  if (!supabase) {
    fs.writeFileSync(LOCAL_PATH, JSON.stringify(db, null, 2));
    return Promise.resolve();
  }
  return supabase
    .from(TABLE)
    .upsert({ id: ROW_ID, data: db, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('⚠️  Erreur de sauvegarde Supabase:', error.message);
    });
}

module.exports = { initDatabase, readDatabase, writeDatabase };
