// MOCK DATABASE
// In reality, this is the government's highly secure citizen registry.
interface Citizen {
  name: string;
  password: string;
}

interface mockCitizensType {
  [key: string]: Citizen;
}

const mockCitizens: mockCitizensType = {
  "citizen_001": { name: "Alice", password: "password123" },
  "citizen_002": { name: "Bob", password: "password123" }
};

// Get citizen by ID
const getCitizenById = (citizenId: string): Citizen | undefined => {
  return mockCitizens[citizenId];
};

// Verify citizen credentials
const verifyCitizen = (citizenId: string, password: string): boolean => {
  const citizen = mockCitizens[citizenId];
  return !!citizen && citizen.password === password;
};

export { mockCitizens, getCitizenById, verifyCitizen };
