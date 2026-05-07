/**
 * Lease "Terms and Conditions" — fine-print boilerplate that gets appended
 * to every auto-generated lease PDF.
 *
 * Source: Multifamily NW standard rental agreement T&Cs. Adam's MFNW
 * membership covers using this text on his own properties' leases.
 */

export type FinePrintItem = {
  number: number;
  title: string;
  body: string;
};

export const LEASE_FINE_PRINT: FinePrintItem[] = [
  {
    number: 1,
    title: "RENTS",
    body:
      "Unless another date is set forth above, all monthly charges are due and payable on the first of the month and must be paid on time. If rent is not paid by the end of the 4th day of the rental period a late fee in the amount stated on this Rental Agreement will be imposed and become due on the 5th day of the rental period and Owner/Agent may require the rent payment and late fee to be paid by certified check or money order. Partial payments will not be accepted without prior Owner/Agent approval. To protect Owner and its Agents, Owner/Agent may refuse to accept cash payments, rent payments from anyone other than Resident or multiple checks for rent. If any check from Resident has been dishonored for any reason, Owner/Agent may require Resident to make all future rent payments by certified check or money order. If the tenancy is a month-to-month tenancy, Owner/Agent may not increase rents during the first year after the tenancy begins, and may increase rents at any time after the first year of the tenancy by giving Resident at least 90 days prior written notice of the effective date of the rent increase. The notice will specify the amount of the rent increase, the amount of the new rent and the date on which the increase becomes effective. The daily prorates of rents and other monthly charges will be based on one of the following methods chosen by Owner/Agent, which method will be consistently applied throughout the rental term: (a) a 360-day year composed of twelve months of 30 days each; (b) a 365-day year; or (c) the actual number of days in the current month. The daily amount will be multiplied by the actual number of days of occupancy in the current month. NOTE: Unless otherwise specified, the pro-rate shall be based on a 365-day year.",
  },
  {
    number: 2,
    title: "NONPAYMENT OF RENT OR OTHER AMOUNTS DUE",
    body:
      "If rent is not paid when due, Owner/Agent may issue a notice of nonpayment of rent on or after the 5th day of the rental period or a notice of nonpayment of rent on or after the 8th day of the rental period. Failure of Resident to timely pay any other amounts due Owner/Agent is a material noncompliance with this Rental Agreement.",
  },
  {
    number: 3,
    title: "APPLICATION OF PAYMENTS",
    body:
      "Except as set forth below, all payments made by Resident to Owner/Agent after the tenancy commences, no matter how designated by Resident, may be applied by Owner/Agent as follows: first to any outstanding rent from prior periods; second, rent for the current rental period; third, utility or service charges; fourth, to late rent payment charges; and finally, to any other fees, charges, damage claims or other claims owed by Resident. Owner/Agent may not deduct a previously imposed late charge from a current or subsequent rental period rent payment, thereby making that rent payment delinquent for imposition of a new or additional late charge or for termination of the tenancy for nonpayment of rent. Owner/Agent may not deduct a noncompliance fee from a rent payment.",
  },
  {
    number: 4,
    title: "EARLY TERMINATION OF FIXED TERM TENANCY",
    body:
      "Upon any failure of Resident to occupy the Premises for the full term of a fixed term tenancy, for any reason other than as provided in ORS 90.453(2), 90.472 or 90.475, Owner/Agent may charge Resident either:\n\nA) all of the following: (i) all rent, unpaid fees and other non-rent charges accrued prior to the date that Owner/Agent knew or reasonably should have known of the abandonment or relinquishment of the Premises; (ii) all damages relating to the condition of the Premises; (iii) an early termination fee in the amount stated on page one and which is due on the earlier of the date Resident gives notice to vacate or the date the Premises is vacated; (iv) interest on the above amounts at the statutory rate from the date each was due; and (v) all other amounts which were due and payable under this Rental Agreement prior to the date of abandonment or relinquishment of the Premises; or\n\nB) all actual damages resulting from the early termination, including but not limited to: (i) all rent through the earlier of the date the Premises is re-rented and the lease termination date; (ii) advertising and administrative costs to re-rent the Premises; (iii) concessions given to a new resident to re-rent the Premises; (iv) the difference in rent if a lower rental rate is received from a replacement resident during the remaining term of the original Rental Agreement; (v) damages related to the condition of the Premises; and (vi) interest on all amounts at the statutory rate.",
  },
  {
    number: 5,
    title: "CONCESSIONS",
    body:
      "Upon any failure of Resident(s) to occupy the Premises for the full term of a fixed term tenancy for any reason, Resident(s) shall immediately repay Owner/Agent any concession Resident has received to date.",
  },
  {
    number: 6,
    title: "RESIDENT'S TERMINATION OF MONTH-TO-MONTH TENANCY",
    body:
      "Resident may only terminate a month-to-month tenancy without cause by giving Owner/Agent written notice not less than 30 days prior to the date designated in the notice for the termination of the month-to-month tenancy. If Resident vacates without providing proper notice to terminate a month-to-month tenancy, Owner/Agent may charge and recoup actual damages which may include up to 30-days of rent beyond the date that Owner/Agent regains possession.",
  },
  {
    number: 7,
    title: "RESIDENT'S NOTICE TO VACATE AT END OF FIXED TERM — FIRST YEAR OF OCCUPANCY",
    body:
      "If this is a fixed term rental agreement and the specified ending date falls within the first year of occupancy, Resident agrees to provide at least 30 days' written notice to Owner/Agent of Resident's intent to vacate at the end of the fixed term. If Resident fails to provide the notice required in this section, Owner/Agent may recover all actual damages incurred, which may include rental loss due to Owner/Agent not being able to market the unit prior to the end of the fixed term. \"First year of occupancy\" includes all periods in which any of the Residents has resided in the dwelling unit for one year or less.",
  },
  {
    number: 8,
    title: "FIXED TERM CONVERSION TO MONTH-TO-MONTH — AFTER FIRST YEAR OF OCCUPANCY",
    body:
      "If the specified ending date for the fixed term falls after the first year of occupancy, this rental agreement will become a month-to-month tenancy upon the expiration of the fixed term, unless: (a) Owner/Agent and Resident agree to a new fixed term tenancy; (b) Resident gives written notice of termination not less than 30 days prior to the specified ending date for the fixed term; or (c) Owner/Agent has a qualifying reason for termination and gives written notice as specified by law.",
  },
  {
    number: 9,
    title: "NO REVOCATION OF TERMINATION NOTICE; ACTUAL DAMAGES FOR FAILURE TO VACATE",
    body:
      "Any termination notice from Resident may not be revoked without Owner/Agent's written consent. If Resident fails to vacate at the end of any termination notice, Resident will be liable for Owner/Agent's actual damages.",
  },
  {
    number: 10,
    title: "PETS, WATERBEDS AND MUSICAL INSTRUMENTS",
    body:
      "No cats, dogs or other pets capable of causing damage to persons or property are allowed on the Premises (either visiting or living there) without a signed pet agreement, payment of any deposit, and providing insurance, as required by Owner/Agent. Resident will be responsible for and indemnify Owner/Agent against any and all damage or injuries caused by Resident's pet(s) or visiting pet(s). Waterbeds and/or aquariums are permissible only with proper insurance and written approval by Owner/Agent. Musical instruments are not allowed without the prior written consent of Owner/Agent.",
  },
  {
    number: 11,
    title: "OCCUPANTS",
    body:
      "The unit will be used only for housing persons listed on this Rental Agreement. Additional Residents must be approved by Owner/Agent and are subject to full screening procedures. Persons other than those specifically listed on this Rental Agreement shall be strictly prohibited from staying in the rental unit for more than 10 consecutive days, or a total of 20 days in any 12-month period. For purposes of this section, \"staying in the rental unit\" means presence on the Premises for a substantial amount of time, whether during the day or overnight, and shall include, but not be limited to, long-term or regular house guests, live-in baby-sitters, visiting relatives, etc. Resident shall notify Owner/Agent in writing at the earlier of: any time the Resident expects any guest to be staying in excess of the time limits contained in this paragraph; or when such person in fact stays in excess of such time limits. Subsidized Residents shall be required to submit a report to the Owner/Agent identifying any person not identified on this Rental Agreement and staying in the rental unit for more than 10 consecutive days, or 20 nonconsecutive days in any 12-month period, and shall state whether such person is contributing to the income of Resident and to what extent. Owner/Agent may require any person listed on page 1 as an \"Other Occupant,\" upon reaching the age of 18, to submit an application and screening charge to Owner/Agent, be screened and if the person meets all current screening criteria, be added to this Rental Agreement as a Resident. Failure to submit an application and screening charge within 10 days of Owner/Agent's request, failure to meet the screening criteria, or failure to execute documents to be added as a Resident within 10 days of a successful screening, will be a material violation of this Rental Agreement.",
  },
  {
    number: 12,
    title: "SUBLETTING",
    body:
      "Transfer of any interest in this Rental Agreement or subletting the Premises, or any part, is not permitted. Subletting means allowing anyone to stay in your unit for consideration, including but not limited to nightly or short-term rentals.",
  },
  {
    number: 13,
    title: "CARE OF PREMISES",
    body:
      "Resident agrees to keep all areas of the Premises clean, sanitary and free from any accumulations of debris, filth, rubbish and garbage and to dispose of same in a proper manner. Resident shall take particular caution regarding the use of cigarettes, if allowed, and other fire hazards. Resident shall not store flammable or hazardous materials. Resident will not store personal property in a manner or in amounts which: increase the risk of fire; impedes proper air circulation; promotes mold growth; impedes safe ingress and egress; overloads floors; encourages pest infestations; or otherwise creates the potential for damage to the unit or danger for Resident or neighbors living on the Premises. Resident is responsible for all damages to furnishings or Premises caused by Resident's negligence, or beyond normal wear and tear. Damage from any type of smoke will never be considered normal wear and tear. Resident shall report leaky or defective faucets at once. Resident must pay for any and all expense due to damage to the building or furnishings, other than ordinary wear and tear, including but not limited to damage caused by stoppage of waste pipes or overflows of bathtubs, toilets or wash basins. Resident is responsible for replacing lightbulbs and batteries which need replacement during the tenancy.",
  },
  {
    number: 14,
    title: "BARBECUES / FIRE PITS",
    body:
      "Resident must fully comply with all applicable codes and regulations related to the use of barbecues. In many areas, fire codes prohibit the use of either charcoal or propane barbecues on apartment balconies or porches unless the area is protected by a fire sprinkler system or all adjacent building surfaces are totally noncombustible. The only exception is the use of electric-style barbecues or the small hibachi-style barbecues that utilize one-pound propane cylinders. These may be allowed when kept well away from combustible building surfaces and unplugged or with cylinder removed (as applicable) when not in use. Fire pits, pellet cookers/stoves and smokers of any kind are prohibited.",
  },
  {
    number: 15,
    title: "USE OF AND CHANGES TO PREMISES",
    body:
      "Resident will: (a) use all electrical, plumbing, sanitary, heating, ventilating, air conditioning and other facilities and appliances on the Premises in a reasonable manner; (b) immediately obtain, pay for and not allow to be disconnected or discontinued the utilities for which Resident is responsible; (c) make no changes or additions to the Premises of any nature; (d) not install or attach anything on the walls, ceilings or in the windows that will cause damage to the unit without the prior written consent of Owner/Agent; (e) not hang anything on or tamper with any fire safety system; (f) not engage in any conduct that violates any applicable laws; (g) not remove, obstruct or tamper with a sprinkler head used for fire suppression. Satellite dishes and/or antennas will be allowed only in strict compliance with Owner/Agent's satellite dish policy and applicable law.",
  },
  {
    number: 16,
    title: "DAMAGE",
    body:
      "Resident agrees not to destroy, damage, deface or remove any part of the Premises or permit any persons to do so and to assume all liability for damages other than ordinary wear and tear.",
  },
  {
    number: 17,
    title: "SECURITY DEPOSITS",
    body:
      "All refundable deposits, however designated, may be used by Owner/Agent to offset any damage, unusual wear and tear or unpaid accounts (including rent) either during the tenancy or at the time of move-out. Owner/Agent may deduct the cost of carpet cleaning from the deposit regardless of whether Resident cleans the carpet before delivering possession of the dwelling unit back to Owner/Agent. If any portion of the deposit is used during the tenancy, Resident will replenish it upon demand. If applied at move-out, any excess will be refunded within the time and in the manner required by law. Any deficiency will be due from Resident at the time the accounting is sent to Resident. Any amounts not paid by Resident within 31 days of the due date will incur interest at 1% per month. Sending the accounting and/or refunding any deposit does not waive the Owner/Agent's right to payment for charges discovered or finalized after the accounting was sent. Any security deposit received from multiple Residents shall be refunded: (a) only when the last Resident vacates the unit and terminates the tenancy; (b) made payable to all Residents, unless agreed otherwise by all Residents and Owner/Agent in writing; and (c) mailed to any single forwarding address supplied by Resident (if no forwarding address is supplied, it will be mailed to the Premises). Other than a security deposit final accounting which must be delivered as required by law, Resident authorizes Owner/Agent to send communications about past due amounts to any email, mobile phone or other electronic method listed on the front of this Rental Agreement. If the Owner is specified on page 1 of this Rental Agreement as the party who will hold refundable security deposits, all deposits received by the Agent will be deposited by Agent into a trust account as required by Oregon law. Agent will then forward the deposits to the Owner of the property, who will manage the deposits pursuant to Oregon law. If the Owner will hold refundable security deposits, Resident will look solely to the Owner, and not Agent, for any refund due.",
  },
  {
    number: 18,
    title: "NON-COMPLIANCE FEES",
    body:
      "Owner/Agent may charge a fee for a second noncompliance or for a subsequent noncompliance with written rules or policies that describe the prohibited conduct and the fee for a second noncompliance, and for any third or subsequent noncompliance, that occurs within one year after a written warning notice. Except as provided below, the fee may not exceed $50 for the second noncompliance within one year after the warning notice for the same or a similar noncompliance or $50 plus five percent of the rent payment for the current rental period for a third or subsequent noncompliance within one year after the warning notice for the same or a similar noncompliance. Owner/Agent may charge a fee for occurrences of noncompliance with written rules or policies for the following types of noncompliance: (A) The late payment of a utility or service charge that the tenant owes the landlord (date of payment must be specified in the utility bill and must not be less than 30 days after delivery of the bill); (B) Failure to clean up pet waste from a part of the Premises other than the dwelling unit; (C) Failure to clean up the waste of a service animal or a companion animal from a part of the Premises other than the dwelling unit; (D) Failure to clean up garbage, rubbish and other waste from a part of the Premises other than the dwelling unit; (E) Parking violations; (F) The improper use of vehicles within the Premises; (G) Smoking in a clearly designated nonsmoking unit or area of the Premises; and (H) Keeping on the Premises an unauthorized pet capable of causing damage to persons or property. The fee for a second or subsequent noncompliance with subsections (G) or (H) may not exceed $250 and cannot be assessed before 24 hours for subsection (G) and 48 hours for subsection (H) after the required warning to Resident.",
  },
  {
    number: 19,
    title: "JOINT RESPONSIBILITY",
    body:
      "Each Resident is jointly and severally responsible for rent, all other performance and financial obligations hereunder and any damage caused to the dwelling unit or common area by Resident, any Resident or Occupant of the same unit or any guest. Costs of repairs for damage must be paid within 7 days after Owner/Agent sends a bill (or such other time as provided in such bill), unless other arrangements have been made, in writing, with Owner/Agent. Any valid termination notice received from any one Resident may be considered by Owner/Agent a termination notice from all Residents. Any Resident not giving the notice who desires to remain in the Premises may be required to submit updated financial information and requalify under Owner/Agent's then-current criteria.",
  },
  {
    number: 20,
    title: "ACCESS",
    body:
      "Resident agrees not to unreasonably withhold consent to Owner/Agent to enter the unit in order to inspect the Premises (including taking pictures to document the condition of the Premises), make necessary or agreed repairs, decorations, alterations, or improvements or to show the unit to prospective buyers or residents. Owner/Agent may enter the unit without consent in an emergency or at any reasonable time with 24 hours' actual notice or after receipt of Resident's written request for maintenance. If Owner/Agent is obligated to maintain the yard, Owner/Agent, or its contractors, may enter the yard (but not the dwelling unit) without notice, at reasonable times and with reasonable frequency, to perform the maintenance work.",
  },
  {
    number: 21,
    title: "DUTY TO COOPERATE WITH REPAIRS / RENOVATIONS",
    body:
      "Resident(s) shall cooperate with all maintenance, repairs, and renovations (collectively, the \"Work\") performed by Owner/Agent, its vendors or contractors, including but not limited to, allowing Owner/Agent, vendors, or contractors access to the Premises (after notice as required by law) and following reasonable instructions such as moving furniture and personal items and temporarily ceasing the use of portions of the Premises which are impacted by the Work. In the event that the Premises is uninhabitable or will be rendered uninhabitable during the Work, and upon delivery of written notice from Owner/Agent to Resident(s), Resident(s) agree to vacate the Premises (including removal of personal items) and temporarily relocate until the Work is complete. Upon Owner/Agent giving written notice to temporarily relocate as required herein, Resident(s) shall vacate the Premises as soon as practicable but in no event later than the date set forth in the notice, and if none, 72-hours after service of the notice. If the Work is required due to the deliberate or negligent acts or omissions of Resident(s) or someone on the Premises with Resident's permission or consent, Resident(s) will be responsible for obtaining and paying for temporary accommodations during the Work and for all relocation expenses. In all other cases, Owner/Agent may select and provide accommodations for temporary relocation by providing Resident(s) with the reasonable costs of relocating and returning to the Premises and: (a) another unit selected by Owner/Agent on the same property; (b) another unit at a nearby location selected by Owner/Agent; or (c) a per diem living expense that Resident(s) may use at their discretion. If Resident(s) temporarily move to another unit provided by Owner/Agent all the terms and conditions of this Rental Agreement will apply to the temporary unit, including the duty to pay rent. If Resident(s) are given a per diem, to the extent required by law the rent shall abate until Resident(s) are permitted to return to the Premises. Unless otherwise agreed, Resident(s) shall return to the Premises, and vacate any unit provided by Owner/Agent, within 7 days of Owner/Agent giving actual notice that the Premises are ready for habitation.",
  },
  {
    number: 22,
    title: "ABSENCE",
    body:
      "Resident agrees to notify Owner/Agent of any absence in excess of seven (7) days no later than the first day of absence.",
  },
  {
    number: 23,
    title: "LEGAL ACTION",
    body:
      "In the event Owner/Agent has to bring an action to enforce any provisions of this Rental Agreement or the Oregon Residential Landlord and Tenant Act, the prevailing party shall be entitled to, in addition to costs, reasonable attorney's fees at trial and upon any appeal.",
  },
  {
    number: 24,
    title: "LOCKS",
    body:
      "Doors of Resident's unit should be kept locked. Resident shall notify Owner/Agent in writing if locks fail to operate. Owner/Agent will not be liable or responsible in any way for loss or damage to articles or property belonging to Resident. Resident shall not change the locks without Owner/Agent's prior consent. Resident shall immediately provide Owner/Agent with a key to any new locks installed. Owner/Agent is not required to provide lockout services.",
  },
  {
    number: 25,
    title: "RENTER'S INSURANCE",
    body:
      "If renter's insurance is required by this Rental Agreement, the Resident, or all Residents as a group if there are multiple Residents, will obtain and maintain insurance with liability coverages of at least the minimum amount listed. If there are multiple Residents, all must be named insureds on the policy, or at the Residents' option, they may each obtain a policy with limits in the minimum amount listed. Oregon law provides that no insurance may be required if: (a) the household income of all of the Residents in the Unit is equal to or less than 50 percent of the area median income, adjusted for family size as measured up to a five-person family; or (b) if the dwelling unit has been subsidized with public funds, not including housing choice vouchers. Resident will supply Owner/Agent with evidence of renter's insurance prior to occupying the unit. Resident must name Owner/Agent as an interested party on Resident's renter's liability insurance policy authorizing the insurer to notify Owner/Agent of: (A) cancellation or nonrenewal of the policy; (B) reduction of policy coverage; or (C) removal of Owner/Agent as an interested party. Owner/Agent may require documentation that: (a) Resident has named Owner/Agent as an interested party on Resident's renter's liability insurance policy; or (b) that Resident's liability insurance is in effect on a periodic basis related to the coverage period of the renter's liability insurance policy or more frequently if Owner/Agent reasonably believes that Resident fails to maintain the renter's liability insurance. Failure to maintain such insurance in full force will be considered a material non-compliance with this Rental Agreement. Owner/Agent may require that Resident obtain or maintain renter's liability insurance only if Owner/Agent obtains and maintains comparable liability insurance and provides documentation to any Resident who requests the documentation, orally or in writing. Owner/Agent may provide documentation to Resident in person, by mail or by posting in a common area or office. The documentation may consist of a current certificate of coverage. If insurance is not required by this Rental Agreement, Resident should maintain renter's insurance to cover Resident's liability to Owner/Agent, as well as damage or destruction of Resident's property. Whether or not renter's insurance is required, Resident is not a co-insured under, and has no rights to, Owner/Agent's insurance policies. Except to the extent required by law, Owner/Agent is not responsible for, and its insurance does not cover damage or destruction to, Resident's property.",
  },
  {
    number: 26,
    title: "CONDUCT",
    body:
      "The dwelling unit is to be used only as a dwelling. The dwelling unit may not be used for the conduct of any commercial activity that involves customers or clients coming to the unit (including but not limited to day care) or the delivery or storage of inventory or equipment. Each Resident is responsible for the conduct of all Residents in the unit, as well as the conduct of any guest. Residents shall not engage in noisy or other conduct that disturbs the quiet enjoyment of any other resident, drunk or disorderly conduct, verbal harassment (e.g. screaming, yelling, swearing, or using profane or offensive words), written harassment (e.g. cyberbullying, sending mail or emails with profane or offensive words or posting untrue statements on-site or on-line), or physical harassment (e.g. assaulting, battering, intimidating, threatening physical harm). Between 10:00 p.m. and 7:00 a.m. the level and/or type of noise emitted from the unit may not exceed what is normal and customary for similar housing. Residents will not be permitted to play in halls, stairways or entrance of buildings, gardens or landscape areas except where specifically permitted by Owner/Agent. The use, possession, manufacture, or distribution of illegal substances, as defined in either federal or state law, either on or in the vicinity of the Premises is strictly prohibited. Resident may not allow any person to: (a) be on the Premises who has been excluded from the common areas by Owner/Agent; or (b) stay in Resident's unit, as defined in the \"Occupants\" section above, who has had their Rental Agreement terminated by Owner/Agent. No one may engage in any unlawful conduct on or near the Premises or in conduct that endangers themselves or others. No one may enter or use any areas of the property that are not intended for use by residents such as roofs, attics, crawl spaces, maintenance shops, etc.",
  },
  {
    number: 27,
    title: "INTERFERENCE WITH MANAGEMENT",
    body:
      "Resident and Resident's guests, invitees, occupants, or persons under Resident's control shall not interfere with management of the Premises. For purposes of this section, interference with management includes but is not limited to verbal harassment (e.g. screaming, yelling, swearing, or using profane or offensive words), written harassment (e.g. cyberbullying, sending mail or emails with profane or offensive words or posting untrue statements on-site or on-line), and physical harassment (e.g. assaulting, battering, intimidating, threatening physical harm, or preventing work to be performed) of the Owner/Agent, including any employees or agents thereof, or of prospective residents.",
  },
  {
    number: 28,
    title: "UTILITY BILL-BACK",
    body:
      "The party designated as the \"customer of record\" that is required to provide any utility herein shall open and maintain an account with and timely pay the provider of that utility except that Resident may be required to pay/reimburse Owner/Agent for said charges provided by Owner/Agent pursuant to the terms of any Utility Bill-Back Addendum. Owner/Agent may require Resident to pay/reimburse Owner/Agent for said charges for a utility or service provided directly, or for a public service provided indirectly, to the Resident's dwelling unit or to a common area available to the Resident as part of the tenancy. The manner in which the charge is allocated among the Residents is subject to Owner/Agent's sole discretion and is subject to change without notice provided that the annual amount charged to all Residents may not exceed the annual amount Owner/Agent pays for said utilities/services. If not provided herein or in the Utility Bill-Back Addendum, Owner/Agent shall provide an explanation of the manner in which charges are allocated among Residents in the bill each month.",
  },
  {
    number: 29,
    title: "MALFUNCTIONS",
    body:
      "Resident will immediately report in writing all malfunctions of equipment, failures of essential services, or needs for repair. Resident shall not tamper with the heating system, plumbing system, appliances, locks, doors, light fixtures, smoke alarms or carbon monoxide alarms.",
  },
  {
    number: 30,
    title: "RESIDENT LOSSES",
    body:
      "Owner/Agent shall not be liable for damages of any kind caused by the lack of heat, refrigeration or other services to the Premises arising out of any accident, act of God, or occurrence beyond the control of Owner/Agent. Resident shall be limited to the rights and remedies specified in the Oregon Residential Landlord and Tenant Act.",
  },
  {
    number: 31,
    title: "CO-SIGNER",
    body:
      "If the obligations under this Rental Agreement are guaranteed by a co-signer, Resident agrees that Owner/Agent would not have rented without the guaranty. In the event the guaranty is terminated or becomes unenforceable for any reason, this will be considered a material noncompliance with this Rental Agreement.",
  },
  {
    number: 32,
    title: "COMMUNITY RULES",
    body:
      "Unless Owner/Agent has custom rules and regulations for the property, the rules and regulations contained in Multifamily NW form M132 (Community Rules & Regulations) apply and are incorporated by reference herein.",
  },
  {
    number: 33,
    title: "WRITTEN NOTICES",
    body:
      "All notices required under this Rental Agreement or state law to be in writing shall be served personally, by first class mail or by first class mail and attachment. If served by first class mail and attachment, a notice from Owner/Agent to Resident shall be deemed served on the day and at the time it is both mailed by first class mail to Resident at the Premises and attached in a secure manner to the main entrance of that portion of the Premises of which Resident has possession. If served by first class mail and attachment, a notice from Resident to Owner/Agent shall be deemed served on the day one copy is mailed by first class mail to Owner/Agent at the mailing address set forth on page one of this Rental Agreement and a second copy attached in a secure manner to the \"Owner/Agent's Designated Location for Attached Notices\" identified on page one of this Rental Agreement. If the Owner/Agent's Designated Location for Attached Notices is located inside a secured building, the notice should be attached to the main entrance of such building. Agent is authorized to accept notices on behalf of Owner.",
  },
  {
    number: 34,
    title: "ACTUAL NOTICE",
    body:
      "Whenever state law requires actual notice, such notice may be served by one or more of the following methods: (a) verbally to Owner/Agent or Resident or by leaving a message on Owner/Agent's or Resident's answering machine or voicemail system; (b) written notice that is personally delivered to Owner/Agent or Resident, left at Owner/Agent's rental office, sent by facsimile to Owner/Agent's residence or rental office or to Resident's dwelling unit, or attached in a secure manner to the main entrance of Owner/Agent's residence or Resident's dwelling unit; (c) written notice that is delivered by first class mail to Owner/Agent or Resident, which notice shall be considered served three days after the date the notice was mailed; or (d) written notice electronically delivered to any email address, mobile phone number, resident portal provided by Owner/Agent, or other electronic method listed on the front of this Agreement or specified by either party in writing from time to time. Resident is responsible for keeping Owner/Agent advised of any changes to the electronic delivery address/phone number. Resident shall timely enroll in any resident portal provided by Owner/Agent. Utility bills may be delivered electronically or by methods (b) or (c) above.",
  },
  {
    number: 35,
    title: "PARKING AND USE OF VEHICLES",
    body:
      "Unless Owner/Agent has custom parking rules for the property, all off-street parking is governed by the rules and regulations contained in Multifamily NW form M158 OR (Parking Agreement) which Resident acknowledges receiving and is incorporated by reference herein. Resident agrees to comply with all posted parking restrictions. Resident will drive in a safe manner and comply with all posted speed limit signs at all times, and if no posted speed limit, the speed limit is 5 miles per hour.",
  },
  {
    number: 36,
    title: "CONTROL OF COMMON AREAS",
    body:
      "Owner/Agent and any person designated by Owner/Agent retain control over any common areas of the Premises for the purposes of enforcing state trespass laws and shall be the \"person in charge\" for that purpose as that phrase is defined at ORS 164.205(5). If Owner/Agent excludes a person from the common areas, Resident may not invite such person into their unit or grant permission to such person to enter or remain on the common areas.",
  },
  {
    number: 37,
    title: "HOMEOWNER ASSOCIATION ASSESSMENTS",
    body:
      "Resident will pay assessments, as defined in ORS 94.550 and 100.005, if the unit is within a homeowners association organized under ORS 94.625 or an association of unit owners organized under ORS 100.405, and: (A) The assessments are imposed by the association on Owner/Agent; (B) The assessments are imposed by the association on any person for expenses related to moving into or out of a unit located within the association; and (C) Owner/Agent gives a copy of the assessment to Resident before or at the time Owner/Agent charges Resident. Any assessment required to be paid by Resident under this section is due at the time a copy of the assessment is provided to Resident.",
  },
  {
    number: 38,
    title: "REQUESTS FOR REASONABLE ACCOMMODATION / MODIFICATION",
    body:
      "As required under federal, state, and local fair housing laws, Residents with disabilities may request reasonable accommodations/modifications related to their housing. All requests must be made to the Owner/Agent specifying the nature of the requested accommodation/modification. It is recommended, but not required, that such requests be made in writing.",
  },
  {
    number: 39,
    title: "TERMINATION FOR FALSE INFORMATION OR CRIMINAL CONVICTION",
    body:
      "If any information supplied in conjunction with application for this rental unit is later found to be false, or if any occupant is convicted of a crime during the tenancy that would constitute grounds for denial of tenancy under Owner/Agent's current rental criteria, this is grounds for termination of tenancy.",
  },
  {
    number: 40,
    title: "RESCREENING",
    body:
      "Each Resident authorizes Owner/Agent to obtain a new or updated consumer credit report and/or an investigative consumer report: if any Resident requests to transfer to another unit; upon any change in either the Owner or Agent; annually; any Resident leaves or a new Resident is approved by Owner/Agent; or for any other valid business purpose. A consumer credit report or an investigative consumer report may include the checking of the Resident's credit, income, employment, rental history, and criminal court records and may include information as to Resident's character, general reputation, personal characteristics, and mode of living. Each Resident has the right to request additional disclosures provided under Section 606(b) of the Fair Credit Reporting Act, and a written summary of your rights pursuant to Section 609(c). Each Resident has the right to dispute the accuracy of the information provided to the Owner/Agent by the screening company or the credit reporting agency as well as complete and accurate disclosure of the nature and scope of the investigation.",
  },
  {
    number: 41,
    title: "SIGHT UNSEEN",
    body:
      "If Resident has executed this Agreement without first visiting the unit, Resident's dissatisfaction with the unit at the time possession is delivered is not grounds to terminate this Agreement.",
  },
  {
    number: 42,
    title: "COMPLETE AGREEMENT",
    body:
      "This Rental Agreement, any rules and regulations for the Premises, and, except as provided below, any other written addenda executed by the parties on or after the date of this Rental Agreement contain the entire understanding of the parties. There are no prior oral or written agreements unless they are referenced herein. If this is a renewal of an existing Rental Agreement, all written addenda executed on or after the date of the original Rental Agreement, to the extent consistent herewith, remain in effect and are incorporated herein.",
  },
];
