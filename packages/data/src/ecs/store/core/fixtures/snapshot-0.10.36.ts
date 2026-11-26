// © 2026 Adobe. MIT License. See /LICENSE for details.

// `serializeToJSON(store.toData({ copy: true }), { space: 2 })` from @adobe/data 0.10.36; see stored-snapshot.test.ts.
export const snapshot_0_10_36 = `{
  "json": {
    "version": 2,
    "componentSchemas": {
      "id": {
        "type": "integer",
        "minimum": -2147483648,
        "maximum": 2147483647,
        "default": 0,
        "entity": true
      },
      "nonPersistent": {
        "type": "boolean",
        "const": true,
        "default": true
      },
      "nonShared": {
        "type": "boolean",
        "const": true,
        "default": true
      },
      "name": {
        "type": "string",
        "default": ""
      },
      "parent": {
        "type": "integer",
        "minimum": -2147483648,
        "maximum": 2147483647,
        "default": 0,
        "entity": true
      },
      "target": {
        "oneOf": [
          {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647,
            "default": 0,
            "entity": true
          },
          {
            "type": "null"
          }
        ],
        "default": null
      },
      "link": {
        "type": "object",
        "properties": {
          "to": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647,
            "default": 0,
            "entity": true
          },
          "weight": {
            "type": "number",
            "precision": 1,
            "default": 0
          }
        },
        "required": [
          "to",
          "weight"
        ],
        "default": {
          "to": 0,
          "weight": 0
        }
      },
      "members": {
        "type": "array",
        "items": {
          "type": "integer",
          "minimum": -2147483648,
          "maximum": 2147483647,
          "default": 0,
          "entity": true
        },
        "default": []
      },
      "selected": {
        "type": "integer",
        "minimum": -2147483648,
        "maximum": 2147483647,
        "default": -1,
        "entity": true
      }
    },
    "entityLocationTables": {
      "0": {
        "entities": {
          "codec": "Int32Array",
          "binaryIndex": 0,
          "binaryCount": 1
        },
        "freeListHead": 3,
        "nextIndex": 5,
        "capacity": 16
      },
      "2": {
        "entities": {
          "codec": "Int32Array",
          "binaryIndex": 1,
          "binaryCount": 1
        },
        "freeListHead": -1,
        "nextIndex": 0,
        "capacity": 16
      }
    },
    "archetypesData": [
      {
        "componentNames": [
          "id",
          "selected"
        ],
        "data": {
          "columns": {
            "id": {
              "codec": "typed-buffer",
              "json": {
                "type": "number",
                "schema": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647,
                  "default": 0,
                  "entity": true
                },
                "capacity": 16
              },
              "binaryIndex": 2,
              "binaryCount": 1
            },
            "selected": {
              "codec": "typed-buffer",
              "json": {
                "type": "number",
                "schema": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647,
                  "default": -1,
                  "entity": true
                },
                "capacity": 16
              },
              "binaryIndex": 3,
              "binaryCount": 1
            }
          },
          "rowCount": 1,
          "rowCapacity": 16
        }
      },
      {
        "componentNames": [
          "id",
          "name",
          "parent",
          "target",
          "link",
          "members"
        ],
        "data": {
          "columns": {
            "id": {
              "codec": "typed-buffer",
              "json": {
                "type": "number",
                "schema": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647,
                  "default": 0,
                  "entity": true
                },
                "capacity": 16
              },
              "binaryIndex": 4,
              "binaryCount": 1
            },
            "name": {
              "codec": "typed-buffer",
              "json": {
                "type": "array",
                "schema": {
                  "type": "string",
                  "default": ""
                },
                "capacity": 16,
                "array": [
                  "a",
                  "b",
                  "c",
                  "c",
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null
                ]
              },
              "binaryIndex": 5,
              "binaryCount": 0
            },
            "parent": {
              "codec": "typed-buffer",
              "json": {
                "type": "number",
                "schema": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647,
                  "default": 0,
                  "entity": true
                },
                "capacity": 16
              },
              "binaryIndex": 5,
              "binaryCount": 1
            },
            "target": {
              "codec": "typed-buffer",
              "json": {
                "type": "array",
                "schema": {
                  "oneOf": [
                    {
                      "type": "integer",
                      "minimum": -2147483648,
                      "maximum": 2147483647,
                      "default": 0,
                      "entity": true
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "default": null
                },
                "capacity": 16,
                "array": [
                  null,
                  4,
                  12,
                  12,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null
                ]
              },
              "binaryIndex": 6,
              "binaryCount": 0
            },
            "link": {
              "codec": "typed-buffer",
              "json": {
                "type": "struct",
                "schema": {
                  "type": "object",
                  "properties": {
                    "to": {
                      "type": "integer",
                      "minimum": -2147483648,
                      "maximum": 2147483647,
                      "default": 0,
                      "entity": true
                    },
                    "weight": {
                      "type": "number",
                      "precision": 1,
                      "default": 0
                    }
                  },
                  "required": [
                    "to",
                    "weight"
                  ],
                  "default": {
                    "to": 0,
                    "weight": 0
                  }
                },
                "capacity": 16
              },
              "binaryIndex": 6,
              "binaryCount": 1
            },
            "members": {
              "codec": "typed-buffer",
              "json": {
                "type": "array",
                "schema": {
                  "type": "array",
                  "items": {
                    "type": "integer",
                    "minimum": -2147483648,
                    "maximum": 2147483647,
                    "default": 0,
                    "entity": true
                  },
                  "default": []
                },
                "capacity": 16,
                "array": [
                  [],
                  [
                    4
                  ],
                  [
                    4,
                    8
                  ],
                  [
                    4,
                    8
                  ],
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null
                ]
              },
              "binaryIndex": 7,
              "binaryCount": 0
            }
          },
          "rowCount": 3,
          "rowCapacity": 16
        }
      }
    ]
  },
  "lengths": [
    128,
    128,
    64,
    64,
    64,
    64,
    256
  ],
  "binary": "eJxjYIAARiQahP9DAYjNxDAKcAEBCvWzMDAwcEDNIdcsmBkcZLuiwR7ZLAYGBgcYH2JmA07+UAcA1/YK4g=="
}`;
