import { Request, Response } from 'express';
import { Contact } from '../model/contact';
import { Client, PoolClient } from 'pg';
import pool from '../config/dbConfig';

async function createContactTableIfNotExists(client: PoolClient) {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS Contact (
      id SERIAL PRIMARY KEY,
      phonenumber VARCHAR(20),
      email VARCHAR(255),
      linkedId INT,
      linkPrecedence VARCHAR(10),
      createdAt TIMESTAMP,
      updatedAt TIMESTAMP,
      deletedAt TIMESTAMP
    )
  `;

  await client.query(createTableQuery);
}

async function fetchMatchingContacts(client: PoolClient, email: string, phonenumber: string) {
  const query = `
  SELECT id, phonenumber, email, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt
  FROM Contact 
  WHERE email = $1 OR phonenumber = $2
`;
  const { rows } = await client.query(query, [email, phonenumber]);
  return rows;
}


async function insertNewContact(client: PoolClient, newContact: Contact) {
  const insertQuery = `
  INSERT INTO Contact (phonenumber, email, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  RETURNING id, phonenumber
  `;

  const insertValues = [
    newContact.phonenumber,
    newContact.email,
    newContact.linkedId,
    newContact.linkPrecedence,
    newContact.createdAt,
    newContact.updatedAt,
    newContact.deletedAt,
  ];

  const result = await client.query(insertQuery, insertValues);
  return result.rows[0].id;
}

async function updatePrimaryToSecondary(client: PoolClient, updateContact: Contact) {
  const updateQuery = `
    UPDATE Contact
    SET linkedId = $1, linkPrecedence = $2, updatedAt = $3
    WHERE id = $4
  `;
  const updateValues = [
    updateContact.linkedId,
    updateContact.linkPrecedence,
    updateContact.updatedAt,
    updateContact.id,
  ];

  try {
    await client.query(updateQuery, updateValues);
    return true;
  } catch (error) {
    console.error('Error while updating contact:', error);
    return false;
  }
}

async function identifyAndProcessContact(client: PoolClient, email: string, phonenumber: string, res: Response) {
  // Fetch matching contacts
  const matchingContacts = await fetchMatchingContacts(client, email, phonenumber);

  if (matchingContacts.length === 0) {
    // No matching contact found, create a new primary contact
    const newContact: Contact = {
      id: 0, // it will be auto-generated while insert in the db
      phonenumber,
      email,
      linkedId: null,
      linkPrecedence: 'primary',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const contactId = await insertNewContact(client, newContact);
    return res.status(200).json({
      contact: {
        primaryContactId: contactId,
        emails: [newContact.email],
        phoneNumbers: [newContact.phonenumber],
        secondaryContactIds: [],
      }
    });
  }

  // Handle duplicate and conflict cases
  const duplicateOrConflict = await findDuplicateOrConflict(matchingContacts, email, phonenumber);
  if (duplicateOrConflict) {
    return res.status(400).json({ Error: 'Email and Phone Number Already Exist' });
  }

  const secondaryContacts = matchingContacts.filter(
    (contact: { linkPrecedence: string; }) => contact.linkPrecedence === 'secondary'
  );

  const primaryContactsToUpdate = matchingContacts.filter((each: Contact) => {
    return each.linkPrecedence === 'primary' && (each.email === email || each.phonenumber === phonenumber);
  });

  if (primaryContactsToUpdate.length > 1) {
    const getPrimaryContact = primaryContactsToUpdate[0];
    const secondaryContactToUpdate = primaryContactsToUpdate[1];

    if (secondaryContactToUpdate) {
      const updateContact: Contact = {
        id: secondaryContactToUpdate.id,
        email: secondaryContactToUpdate.email,
        phonenumber: secondaryContactToUpdate.phonenumber,
        linkedId: getPrimaryContact.id,
        linkPrecedence: 'secondary',
        updatedAt: new Date(),
        createdAt: secondaryContactToUpdate.createdAt,
        deletedAt: null
      };

      await updatePrimaryToSecondary(client, updateContact);

      // Update the secondary contact in the array
      secondaryContacts.push(updateContact);

      // Create an array of unique email and phone numbers
      const uniqueEmails = Array.from(new Set([
        getPrimaryContact.email,
        ...secondaryContacts.map((c: { email: any; }) => c.email),
      ]));

      const uniquePhoneNumbers = Array.from(new Set([
        getPrimaryContact.phonenumber,
        ...secondaryContacts.map((c: { phonenumber: any; }) => c.phonenumber),
      ]));

      return res.status(200).json({
        contact: {
          primaryContactId: getPrimaryContact.id,
          emails: uniqueEmails,
          phoneNumbers: uniquePhoneNumbers,
          secondaryContactIds: secondaryContacts.map((c: { id: any; }) => c.id),
        },
      });
    }
  }

  // find primary contact to add secondary contact
  const primaryContact: Contact | undefined = matchingContacts.find(
    (contact: { linkPrecedence: string; }) => contact.linkPrecedence === 'primary'
  );

  if (primaryContact) {
    const newContact: Contact = {
      id: 0,
      phonenumber,
      email,
      linkedId: primaryContact.id,
      linkPrecedence: 'secondary',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    const contactId = await insertNewContact(client, newContact);
    newContact.id = contactId;
    secondaryContacts.push(newContact);

    // Create an array of unique email and phone numbers
    const uniqueEmails = new Set([
      primaryContact.email,
      ...secondaryContacts.map((c: { email: any; }) => c.email),
    ]);

    const uniquePhoneNumbers = Array.from(new Set([
      primaryContact.phonenumber,
      ...secondaryContacts.map((c: { phonenumber: any; }) => c.phonenumber),
    ]));

    return res.status(200).json({
      contact: {
        primaryContactId: primaryContact.id,
        emails: [...uniqueEmails],
        phoneNumbers: uniquePhoneNumbers,
        secondaryContactIds: secondaryContacts.map((c: { id: any; }) => c.id),
      },
    });
  } else {
    // Handle case when no primary contact is found
    return res.status(404).json({
      error: 'Primary contact not found',
    });
  }
}

async function findDuplicateOrConflict(matchingContacts: Contact[], email: string, phonenumber: string) {
  // Your duplicate and conflict checking logic here
  const duplicateCheck = matchingContacts.filter((eachRow: Contact) => {
    return (eachRow.email === email && eachRow.phonenumber == phonenumber);
  });

  const checkConflictPrimaryEmail = matchingContacts.find((each: Contact) => {
    return each.linkPrecedence == 'primary' && (each.phonenumber == phonenumber || each.email == email);
  });

  if (checkConflictPrimaryEmail) {
    const checkConflictSecondaryEmail = matchingContacts.find((each: Contact) => {
      return (each.linkPrecedence == 'secondary' && each.linkedId == checkConflictPrimaryEmail.id && (each.phonenumber == phonenumber || each.email == email));
    });

    if (checkConflictPrimaryEmail && checkConflictSecondaryEmail) {
      return true;
    }
  }

  if (duplicateCheck.length) {
    return true;
  }

  return false;
}

export async function identifyContact(req: Request, res: Response) {
  const { email, phonenumber } = req.body;

  try {
    const client = await pool.connect(); // Acquire a client from the pool
    await createContactTableIfNotExists(client);

    await identifyAndProcessContact(client, email, phonenumber, res);

    client.release(); // Release the client back to the pool
  } catch (error) {
    console.error('Error while querying the database:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
