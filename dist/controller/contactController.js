"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.identifyContact = void 0;
const dbConfig_1 = __importDefault(require("../config/dbConfig"));
async function createContactTableIfNotExists(client) {
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
async function fetchMatchingContacts(client, email, phonenumber) {
    const query = `
  SELECT id, phonenumber, email, linkedId, linkPrecedence, createdAt, updatedAt, deletedAt
  FROM Contact 
  WHERE email = $1 OR phonenumber = $2
`;
    const { rows } = await client.query(query, [email, phonenumber]);
    console.log(rows);
    return rows;
    // return rows.map((row: any) => ({
    //   id: row.id,
    //   phonenumber: row.phonenumber,
    //   email: row.email,
    //   linkedId: row.linkedId,
    //   linkPrecedence: row.linkPrecedence,
    //   createdAt: row.createdAt,
    //   updatedAt: row.updatedAt,
    //   deletedAt: row.deletedAt,
    // }));
}
async function insertNewContact(client, newContact) {
    console.log(newContact, 'new');
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
    console.log('Insert Query:', insertQuery);
    console.log('Insert Values:', insertValues);
    const result = await client.query(insertQuery, insertValues);
    console.log(result, 'result');
    return result.rows[0].id;
}
async function updatePrimaryToSecondary(client, updateContact) {
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
    }
    catch (error) {
        console.error('Error while updating contact:', error);
        return false;
    }
}
async function identifyAndProcessContact(client, email, phonenumber, res) {
    // Fetch matching contacts
    const matchingContacts = await fetchMatchingContacts(client, email, phonenumber);
    // console.log(matchingContacts, 'mat')
    if (matchingContacts.length === 0) {
        // No matching contact found, create a new primary contact
        const newContact = {
            id: 0,
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
    console.log(duplicateOrConflict, 'dup');
    if (duplicateOrConflict) {
        return res.status(400).json({ Error: 'Email and Phone Number Already Exist' });
    }
    const secondaryContacts = matchingContacts.filter((contact) => contact.linkPrecedence === 'secondary');
    const primaryContactsToUpdate = matchingContacts.filter((each) => {
        return each.linkPrecedence === 'primary' && (each.email === email || each.phonenumber === phonenumber);
    });
    if (primaryContactsToUpdate.length > 1) {
        const getPrimaryContact = primaryContactsToUpdate[0];
        const secondaryContactToUpdate = primaryContactsToUpdate[1];
        if (secondaryContactToUpdate) {
            const updateContact = {
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
                ...secondaryContacts.map((c) => c.email),
            ]));
            const uniquePhoneNumbers = Array.from(new Set([
                getPrimaryContact.phonenumber,
                ...secondaryContacts.map((c) => c.phonenumber),
            ]));
            return res.status(200).json({
                contact: {
                    primaryContactId: getPrimaryContact.id,
                    emails: uniqueEmails,
                    phoneNumbers: uniquePhoneNumbers,
                    secondaryContactIds: secondaryContacts.map((c) => c.id),
                },
            });
        }
    }
    // find primary contact to add secondary contact
    const primaryContact = matchingContacts.find((contact) => contact.linkPrecedence === 'primary');
    if (primaryContact) {
        const newContact = {
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
            ...secondaryContacts.map((c) => c.email),
        ]);
        const uniquePhoneNumbers = Array.from(new Set([
            primaryContact.phonenumber,
            ...secondaryContacts.map((c) => c.phonenumber),
        ]));
        return res.status(200).json({
            contact: {
                primaryContactId: primaryContact.id,
                emails: [...uniqueEmails],
                phoneNumbers: uniquePhoneNumbers,
                secondaryContactIds: secondaryContacts.map((c) => c.id),
            },
        });
    }
    else {
        // Handle case when no primary contact is found
        return res.status(404).json({
            error: 'Primary contact not found',
        });
    }
}
async function findDuplicateOrConflict(matchingContacts, email, phonenumber) {
    // Your duplicate and conflict checking logic here
    console.log(matchingContacts, 'matchingCon');
    console.log(email, phonenumber);
    const duplicateCheck = matchingContacts.filter((eachRow) => {
        console.log(eachRow, 'eachrow');
        console.log(eachRow.email === email);
        console.log();
        console.log(eachRow.phonenumber == phonenumber);
        return (eachRow.email === email && eachRow.phonenumber == phonenumber);
    });
    const checkConflictPrimaryEmail = matchingContacts.find((each) => {
        return each.linkPrecedence == 'primary' && (each.phonenumber == phonenumber || each.email == email);
    });
    if (checkConflictPrimaryEmail) {
        const checkConflictSecondaryEmail = matchingContacts.find((each) => {
            return (each.linkPrecedence == 'secondary' && each.linkedId == checkConflictPrimaryEmail.id && (each.phonenumber == phonenumber || each.email == email));
        });
        if (checkConflictPrimaryEmail && checkConflictSecondaryEmail) {
            return true;
        }
    }
    console.log(duplicateCheck, 'duo');
    if (duplicateCheck.length) {
        return true;
    }
    return false;
}
async function identifyContact(req, res) {
    const { email, phonenumber } = req.body;
    try {
        const client = await dbConfig_1.default.connect(); // Acquire a client from the pool
        await createContactTableIfNotExists(client);
        await identifyAndProcessContact(client, email, phonenumber, res);
        client.release(); // Release the client back to the pool
    }
    catch (error) {
        console.error('Error while querying the database:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
exports.identifyContact = identifyContact;
