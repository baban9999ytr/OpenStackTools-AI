// Frozen synthetic decisions from Phase 2G Milestone B. Historical outcomes stay unchanged.
export const phase2gLiveEvidence = {
  "sha256": "440e5e99fe906a151314cfa69077fd0450948b2a47f4cab32002baebf3aee1ec",
  "historical": {
    "scenarios": "3/4",
    "replyPatterns": "6/7",
    "rawSelections": "3/7"
  },
  "decisions": {
    "2g-a-flexible-preferences": [
      {
        "text": "Görükle de Özlüce de olur, iki ya da üç odalı olabilir. Bütçem henüz belli değil.",
        "providerText": "",
        "proposal": {
          "name": "interpret_business_preferences",
          "arguments": {
            "fields": [
              {
                "field": "location",
                "value": "Görükle",
                "evidence": "Görükle de Özlüce de olur"
              },
              {
                "field": "location",
                "value": "Özlüce",
                "evidence": "Görükle de Özlüce de olur"
              },
              {
                "field": "rooms",
                "value": "2 veya 3 oda",
                "evidence": "iki ya da üç odalı olabilir"
              }
            ]
          }
        },
        "historical": {
          "replyPassed": true,
          "selectionCorrect": true,
          "issues": []
        }
      }
    ],
    "2g-b-email-only": [
      {
        "text": "Thanks, just the contact email one more time, olur mu?",
        "providerText": "",
        "proposal": {
          "name": "get_business_knowledge",
          "arguments": {
            "topic": "contact email"
          }
        },
        "historical": {
          "replyPassed": true,
          "selectionCorrect": true,
          "issues": []
        }
      }
    ],
    "2g-c-listing-references": [
      {
        "text": "Görükle'de kiralık 3+1 daire arıyorum, bütçem 35000 TL.",
        "historical": {
          "replyPassed": true,
          "selectionCorrect": null,
          "issues": []
        }
      },
      {
        "text": "İki ilanı karşılaştır, hangisini önerirsin?",
        "providerText": "",
        "proposal": {
          "name": "get_business_knowledge",
          "arguments": {
            "topic": "compare listings recommendation"
          }
        },
        "historical": {
          "replyPassed": true,
          "selectionCorrect": false,
          "issues": []
        }
      },
      {
        "text": "İkinci ilanın aidatı ne kadar?",
        "providerText": "",
        "proposal": {
          "name": "interpret_business_preferences",
          "arguments": {
            "fields": [
              {
                "field": "location",
                "value": "Görükle",
                "evidence": "Görükle'de kiralık 3+1 daire arıyorum"
              },
              {
                "field": "budget",
                "value": 35000,
                "evidence": "bütçem 35000 TL"
              },
              {
                "field": "currency",
                "value": "TRY",
                "evidence": "35000 TL"
              },
              {
                "field": "rooms",
                "value": 3,
                "evidence": "3+1 daire"
              },
              {
                "field": "propertyType",
                "value": "apartment",
                "evidence": "3+1 daire"
              },
              {
                "field": "listingType",
                "value": "rent",
                "evidence": "kiralık"
              }
            ]
          }
        },
        "historical": {
          "replyPassed": false,
          "selectionCorrect": false,
          "issues": [
            "listingReference",
            "persistedReference",
            "verifiedReply"
          ]
        }
      },
      {
        "text": "Yok yok, ilkini kastetmiştim, onun depozitosu belli mi?",
        "providerText": "İlk ilanın depozito bilgisi doğrulanmış kayıtlarda yer almıyor; bu nedenle tutarı teyit edemiyorum.",
        "proposal": null,
        "historical": {
          "replyPassed": true,
          "selectionCorrect": true,
          "issues": []
        }
      }
    ],
    "2g-d-unknown-and-viewing": [
      {
        "text": "Metro yürüyerek kaç dakika, tapu kimin üstüne?",
        "providerText": "",
        "proposal": {
          "name": "search_listings",
          "arguments": {
            "availability": "available"
          }
        },
        "historical": {
          "replyPassed": true,
          "selectionCorrect": false,
          "issues": []
        }
      },
      {
        "text": "Bir de eşyalı mı, hafta sonu gezme ihtimalimiz var mı?",
        "providerText": "",
        "proposal": {
          "name": "get_business_knowledge",
          "arguments": {
            "topic": "property viewing"
          }
        },
        "historical": {
          "replyPassed": true,
          "selectionCorrect": false,
          "issues": []
        }
      }
    ]
  }
};
