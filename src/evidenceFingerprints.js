// Fingerprints detect changes to the source facts used in the September audit.
export const evidenceFingerprints={
  "22PeEMyttuK6": {
    "item": "242fa4c"
  },
  "22Pds22G2gek": {
    "item": "6a5ab25d"
  },
  "22PeL3yjHvhJ": {
    "item": "84d594c2",
    "payment": "24cc5bc2"
  },
  "22PedC99Jbkv": {
    "item": "4377c12b"
  },
  "22PejR5WpTJr": {
    "item": "4ffa9d68",
    "comment": "6107ef1d"
  },
  "22PejR6yTu65": {
    "item": "8637ffa1",
    "comment": "b90097b5"
  },
  "22PejR6yTu66": {
    "item": "1ce1f174",
    "comment": "b90097b5"
  },
  "22PejR6yTu67": {
    "item": "3978d2ab",
    "comment": "b90097b5"
  },
  "22PejR6yTu68": {
    "item": "a1cbff0e",
    "comment": "b90097b5"
  },
  "22PejR6yTu69": {
    "item": "c308faa9",
    "comment": "b90097b5"
  },
  "22PejR6yTu6A": {
    "item": "8b6d1357",
    "comment": "b90097b5"
  },
  "22PevJ3mSBiL": {
    "item": "2ecb44f2",
    "comment": "a302f28c"
  },
  "22Pey9rHJGcj": {
    "item": "86d6b06",
    "comment": "10e1823c",
    "payment": "3da1fb1d"
  },
  "22PeHmSRAQRZ": {
    "item": "67eb22c8",
    "comment": "89ec47fc"
  }
};
export const digest=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(16)};
