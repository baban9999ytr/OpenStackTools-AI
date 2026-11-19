// Frozen synthetic evidence. Update future expectations in the replay suite.
export const phase2fEvidence = {
  "origin": "Phase 2F Milestone B, 2026-11-19. Synthetic turns only.",
  "sourceSha256": "97cfc3db84ea4e671937afbfdcd43296bbcb4bf3a469de8c96c3329b64f99e8f",
  "strictSelection": {
    "passed": 3,
    "total": 9
  },
  "scenarios": [
    {
      "scenario": "2f-turkish-clarification",
      "locale": "tr",
      "turns": [
        {
          "text": "Abi selam, bi şey danışacaktım.",
          "providerText": "Selam, tabii. Ne danışmak istiyorsun?",
          "proposal": null,
          "historicalApplication": {
            "preferences": {},
            "tool": null,
            "proposal": null,
            "reply": "Selam, tabii. Ne danışmak istiyorsun?",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": true,
            "argumentsCorrect": null,
            "rawProseSignals": {
              "verifiedPrices": true,
              "verifiedClockTimes": true,
              "noUnconfirmedBookingClaim": true
            },
            "reviewFocus": "Match the informal register without guessing the customer's goal."
          },
          "historicalSafetyPassed": true
        },
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
                  "value": 2,
                  "evidence": "iki ya da üç odalı olabilir"
                },
                {
                  "field": "rooms",
                  "value": 3,
                  "evidence": "iki ya da üç odalı olabilir"
                }
              ]
            }
          },
          "historicalApplication": {
            "preferences": {},
            "tool": null,
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
                    "value": 2,
                    "evidence": "iki ya da üç odalı olabilir"
                  },
                  {
                    "field": "rooms",
                    "value": 3,
                    "evidence": "iki ya da üç odalı olabilir"
                  }
                ]
              }
            },
            "reply": "Hangi tercihi değiştirmek istediğinizi netleştirir misiniz?",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [
            "verifiedReply"
          ],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Recognize both location and room alternatives and ask one useful question. Do not invent a budget."
          },
          "historicalSafetyPassed": true
        }
      ]
    },
    {
      "scenario": "2f-bilingual-contact",
      "locale": "tr",
      "turns": [
        {
          "text": "E-posta adresiniz ve web siteniz nedir?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "E-posta adresi ve web sitesi iletişim bilgileri"
            }
          },
          "historicalApplication": {
            "preferences": {},
            "tool": "get_business_knowledge",
            "arguments": {
              "topic": "E-posta adresiniz ve web siteniz nedir?"
            },
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "E-posta adresi ve web sitesi iletişim bilgileri"
              }
            },
            "reply": "Bize office@example.test adresinden yazabilirsiniz. Web sitemiz https://agency.example.test",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": true,
            "argumentsCorrect": false,
            "rawProseSignals": null,
            "reviewFocus": "Select the knowledge tool and address both requested contact fields."
          },
          "historicalSafetyPassed": true
        },
        {
          "text": "Thanks, just the contact email one more time, olur mu?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "contact email"
            }
          },
          "historicalApplication": {
            "preferences": {},
            "tool": "get_business_knowledge",
            "arguments": {
              "topic": "Thanks, just the contact email one more time, olur mu?"
            },
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "contact email"
              }
            },
            "reply": "Bize office@example.test adresinden yazabilirsiniz. Web sitemiz https://agency.example.test",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": true,
            "argumentsCorrect": false,
            "rawProseSignals": null,
            "reviewFocus": "Recognize a code-switched email-only follow-up. Review whether the delivered reply adds unnecessary fields."
          },
          "historicalSafetyPassed": true
        }
      ]
    },
    {
      "scenario": "2f-verified-listing-references",
      "locale": "tr",
      "turns": [
        {
          "text": "Görükle'de kiralık 3+1 daire arıyorum, bütçem 35000 TL.",
          "historicalApplication": {
            "preferences": {
              "location": "Görükle",
              "rooms": 3,
              "budget": 35000,
              "currency": "TRY",
              "propertyType": "apartment",
              "listingType": "rent"
            },
            "tool": "search_listings",
            "arguments": {
              "budgetMax": 35000,
              "currency": "TRY",
              "location": "Görükle",
              "propertyType": "apartment",
              "listingType": "rent",
              "exactRooms": 3,
              "availability": "available"
            },
            "reply": "Güncel uygun ilanlar:\n1. Synthetic flat 27000: Görükle · 3+1 · kiralık — 27.000 TL.\n2. Synthetic flat 34000: Görükle · 3+1 · kiralık — 34.000 TL. Eşyalı veya eşyasız tercihiniz var mı?",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": null,
            "argumentsCorrect": null,
            "rawProseSignals": null
          },
          "historicalSafetyPassed": true
        },
        {
          "text": "İki ilanı karşılaştır, hangisini önerirsin?",
          "providerText": "",
          "proposal": {
            "name": "search_listings",
            "arguments": {
              "budgetMax": 35000,
              "currency": "TRY",
              "listingType": "rent",
              "propertyType": "apartment",
              "location": "Görükle",
              "minRooms": 3
            }
          },
          "historicalApplication": {
            "preferences": {
              "location": "Görükle",
              "rooms": 3,
              "budget": 35000,
              "currency": "TRY",
              "propertyType": "apartment",
              "listingType": "rent"
            },
            "tool": null,
            "proposal": {
              "name": "search_listings",
              "arguments": {
                "budgetMax": 35000,
                "currency": "TRY",
                "listingType": "rent",
                "propertyType": "apartment",
                "location": "Görükle",
                "minRooms": 3
              }
            },
            "reply": "Fiyat önceliğinizse Görükle konumundaki 27.000 TL tutarındaki ilanı öneririm; Görükle konumundaki seçeneğe göre 7.000 TL daha uygun. Konum veya diğer özellikler sizin için önemliyse tercihlerinizi söyleyin; kayıtlı ayrıntıları karşılaştıralım.",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Compare only verified facts. Do not make stronger claims than the stored listings support."
          },
          "historicalSafetyPassed": true
        },
        {
          "text": "İkinci ilanın aidatı ne kadar?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "listing fees, monthly maintenance dues (aidat), and comparing the two Görükle rental listings from the prior search"
            }
          },
          "historicalApplication": {
            "preferences": {
              "location": "Görükle",
              "rooms": 3,
              "budget": 35000,
              "currency": "TRY",
              "propertyType": "apartment",
              "listingType": "rent"
            },
            "tool": null,
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "listing fees, monthly maintenance dues (aidat), and comparing the two Görükle rental listings from the prior search"
              }
            },
            "reply": "Synthetic flat 34000 için aidat bilgisi kayıtlı ilanda doğrulanmamış. İsterseniz danışmana sorabilirim.",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [
            "proposedTool"
          ],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Resolve the second listing and disclose missing dues. A generic search does not resolve the requested attribute."
          },
          "historicalSafetyPassed": true
        },
        {
          "text": "Yok yok, ilkini kastetmiştim, onun depozitosu belli mi?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "Görükle'deki ilk ilan 27000 TL için depozito bilgisi"
            }
          },
          "historicalApplication": {
            "preferences": {
              "location": "Görükle",
              "rooms": 3,
              "budget": 35000,
              "currency": "TRY",
              "propertyType": "apartment",
              "listingType": "rent"
            },
            "tool": null,
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "Görükle'deki ilk ilan 27000 TL için depozito bilgisi"
              }
            },
            "reply": "Synthetic flat 27000 için depozito bilgisi kayıtlı ilanda doğrulanmamış. İsterseniz danışmana sorabilirim.",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Use the corrected first listing and answer the deposit question, independent of the preceding dues request."
          },
          "historicalSafetyPassed": true
        }
      ]
    },
    {
      "scenario": "2f-unknown-facts-and-viewing",
      "locale": "tr",
      "turns": [
        {
          "text": "Metro yürüyerek kaç dakika, tapu kimin üstüne?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "İlanın metroya yürüme mesafesi ve tapu sahibi bilgisi"
            }
          },
          "historicalApplication": {
            "preferences": {},
            "tool": "get_business_knowledge",
            "arguments": {
              "topic": "Metro yürüyerek kaç dakika, tapu kimin üstüne?"
            },
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "İlanın metroya yürüme mesafesi ve tapu sahibi bilgisi"
              }
            },
            "reply": "İşletme bilgileri:\nSynthetic letting agency",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [
            "executedTool",
            "verifiedReply"
          ],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Acknowledge missing transit and ownership data. Do not estimate or identify an owner."
          },
          "historicalSafetyPassed": true
        },
        {
          "text": "Bir de eşyalı mı, hafta sonu gezme ihtimalimiz var mı?",
          "providerText": "",
          "proposal": {
            "name": "get_business_knowledge",
            "arguments": {
              "topic": "Metroya yürüme mesafesi, tapu sahibi, eşyalı olup olmadığı ve hafta sonu gezme imkânı hakkında sorulan ilanın doğrulanmış detayları; önceki konuşmada ilan belirtilmemişse mevcut ilan bilgisini belirleme"
            }
          },
          "historicalApplication": {
            "preferences": {},
            "tool": "get_business_knowledge",
            "arguments": {
              "topic": "Bir de eşyalı mı, hafta sonu gezme ihtimalimiz var mı?"
            },
            "proposal": {
              "name": "get_business_knowledge",
              "arguments": {
                "topic": "Metroya yürüme mesafesi, tapu sahibi, eşyalı olup olmadığı ve hafta sonu gezme imkânı hakkında sorulan ilanın doğrulanmış detayları; önceki konuşmada ilan belirtilmemişse mevcut ilan bilgisini belirleme"
              }
            },
            "reply": "Bu konuda doğrulanmış işletme bilgisi bulamadım. Başka bir ayrıntı sorabilir veya bir ekip üyesine bağlanabilirsiniz.",
            "workflow": "none",
            "status": "bot",
            "bookings": 0
          },
          "historicalIssues": [
            "executedTool",
            "verifiedReply"
          ],
          "historicalDecision": {
            "selectionCorrect": false,
            "argumentsCorrect": null,
            "rawProseSignals": null,
            "reviewFocus": "Address both furnishing and viewing. Ask for the missing listing and avoid offering an invented time or booking."
          },
          "historicalSafetyPassed": true
        }
      ]
    }
  ]
};
