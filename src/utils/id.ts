import { nanoid } from "nanoid";

/**
 * Generate a unique ID with an optional prefix.
 * Examples: generateId() -> "V1StGXR8_Z5jdHi6B-myT"
 *           generateId("email") -> "email_V1StGXR8_Z5jdHi6B-myT"
 */
export const generateId = (prefix?: string): string => {
    const id = nanoid(21);
    return prefix ? `${prefix}_${id}` : id;
};
