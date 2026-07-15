import crypto from 'crypto';
import db from './db';

export interface CitizenData {
  govId: string;
  password: string;
  name: string;
  citizenSeed: string;
  email?: string;
  phone?: string;
  address?: string;
  status: string;
}

const generateCitizenSeed = (): string => crypto.randomBytes(32).toString('hex');

const seedData: CitizenData[] = [
  {
    govId: "199812345678",
    password: "0711234567",
    name: "Kamal Perera",
    citizenSeed: generateCitizenSeed(),
    email: "kamal.perera@email.com",
    phone: "0711234567",
    address: "123 Main Street, Colombo 07",
    status: "Active"
  },
  {
    govId: "199587654321",
    password: "0779876543",
    name: "Nimali Silva",
    citizenSeed: generateCitizenSeed(),
    email: "nimali.silva@email.com",
    phone: "0779876543",
    address: "456 Park Road, Kandy",
    status: "Active"
  },
  {
    govId: "199765432109",
    password: "0712345890",
    name: "Arun Kumar",
    citizenSeed: generateCitizenSeed(),
    email: "arun.kumar@email.com",
    phone: "0712345890",
    address: "789 Temple Lane, Jaffna",
    status: "Active"
  },
  {
    govId: "199654321098",
    password: "0769876540",
    name: "Chamari Jayasinghe",
    citizenSeed: generateCitizenSeed(),
    email: "chamari.j@email.com",
    phone: "0769876540",
    address: "321 Beach Road, Galle",
    status: "Active"
  },
  {
    govId: "199543210987",
    password: "0718765432",
    name: "Ravi Dissanayake",
    citizenSeed: generateCitizenSeed(),
    email: "ravi.d@email.com",
    phone: "0718765432",
    address: "654 Mount View, Nuwara Eliya",
    status: "Active"
  },
  {
    govId: "199432109876",
    password: "0776543210",
    name: "Lakshmi Fernandez",
    citizenSeed: generateCitizenSeed(),
    email: "lakshmi.f@email.com",
    phone: "0776543210",
    address: "987 Ocean Lane, Matara",
    status: "Active"
  },
  {
    govId: "199321098765",
    password: "0712109876",
    name: "Thilak Bandara",
    citizenSeed: generateCitizenSeed(),
    email: "thilak.b@email.com",
    phone: "0712109876",
    address: "147 Hill Road, Kegalle",
    status: "Active"
  },
  {
    govId: "199210987654",
    password: "0779876541",
    name: "Anushka Weerasinghe",
    citizenSeed: generateCitizenSeed(),
    email: "anushka.w@email.com",
    phone: "0779876541",
    address: "258 Valley Street, Badulla",
    status: "Active"
  },
  {
    govId: "199109876543",
    password: "0713456789",
    name: "Sameer Malik",
    citizenSeed: generateCitizenSeed(),
    email: "sameer.malik@email.com",
    phone: "0713456789",
    address: "369 Garden Avenue, Colombo 03",
    status: "Active"
  },
  {
    govId: "199098765432",
    password: "0778765432",
    name: "Priya Menon",
    citizenSeed: generateCitizenSeed(),
    email: "priya.menon@email.com",
    phone: "0778765432",
    address: "741 River Road, Ratnapura",
    status: "Active"
  },
  {
    govId: "198987654321",
    password: "0714567890",
    name: "Vishan Wijaya",
    citizenSeed: generateCitizenSeed(),
    email: "vishan.w@email.com",
    phone: "0714567890",
    address: "852 City Center, Colombo 01",
    status: "Active"
  },
  {
    govId: "198876543210",
    password: "0777654321",
    name: "Divya Sharma",
    citizenSeed: generateCitizenSeed(),
    email: "divya.sharma@email.com",
    phone: "0777654321",
    address: "963 Park Lane, Anuradhapura",
    status: "Active"
  },
  {
    govId: "198765432109",
    password: "0715678901",
    name: "Sanjay Reddy",
    citizenSeed: generateCitizenSeed(),
    email: "sanjay.reddy@email.com",
    phone: "0715678901",
    address: "159 Market Street, Negombo",
    status: "Active"
  },
  {
    govId: "198654321098",
    password: "0776543211",
    name: "Yasmin Ali",
    citizenSeed: generateCitizenSeed(),
    email: "yasmin.ali@email.com",
    phone: "0776543211",
    address: "264 Beach Avenue, Unawatuna",
    status: "Active"
  },
  {
    govId: "198543210987",
    password: "0716789012",
    name: "Rohan Gunarathne",
    citizenSeed: generateCitizenSeed(),
    email: "rohan.g@email.com",
    phone: "0716789012",
    address: "375 Village Road, Panadura",
    status: "Active"
  },
  {
    govId: "198432109876",
    password: "0775432101",
    name: "Sheila Perera",
    citizenSeed: generateCitizenSeed(),
    email: "sheila.p@email.com",
    phone: "0775432101",
    address: "486 Forest Road, Dambulla",
    status: "Active"
  },
  {
    govId: "198321098765",
    password: "0717890123",
    name: "Amit Patel",
    citizenSeed: generateCitizenSeed(),
    email: "amit.patel@email.com",
    phone: "0717890123",
    address: "597 Tech Park, Colombo 04",
    status: "Active"
  },
  {
    govId: "198210987654",
    password: "0774321012",
    name: "Asha Desai",
    citizenSeed: generateCitizenSeed(),
    email: "asha.desai@email.com",
    phone: "0774321012",
    address: "708 Main Boulevard, Gampaha",
    status: "Active"
  },
  {
    govId: "198109876543",
    password: "0718901234",
    name: "Deepak Rajput",
    citizenSeed: generateCitizenSeed(),
    email: "deepak.r@email.com",
    phone: "0718901234",
    address: "819 Industrial Zone, Colombo 02",
    status: "Active"
  },
  {
    govId: "198098765432",
    password: "0773210123",
    name: "Malini Fernando",
    citizenSeed: generateCitizenSeed(),
    email: "malini.f@email.com",
    phone: "0773210123",
    address: "920 Art District, Colombo 05",
    status: "Active"
  }
];

export const seedDatabase = (): void => {
  // Check if data already exists
  const count: { count: number } = db
    .prepare('SELECT COUNT(*) as count FROM citizens')
    .get() as { count: number };

  if (count.count === 0) {
    // Prepare insert statement
    const insertStmt = db.prepare(`
      INSERT INTO citizens (govId, password, citizenSeed, name, email, phone, address, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert all seed data
    const insertMany = db.transaction((citizens: CitizenData[]) => {
      for (const citizen of citizens) {
        insertStmt.run(
          citizen.govId,
          citizen.password,
          citizen.citizenSeed,
          citizen.name,
          citizen.email || null,
          citizen.phone || null,
          citizen.address || null,
          citizen.status
        );
      }
    });

    insertMany(seedData);
    console.log(`✅ Seeded ${seedData.length} citizens into database`);
  } else {
    console.log(`✅ Database already seeded with ${count.count} citizens`);
  }
};
