# Construct Mismatch / Disagreement Cases

Categories are mutually exclusive: D (any MATERIAL ambiguity), then C (reviewers disagree), then B (reviewers agree with each other but not benchmark). Phase-2 labels are unchanged.

## B — BA-001 / memops-t131

- Evidence: my last home blood pressure reading was 126 over 82, so things are heading in the right direction
- Current state: M3=EpiPen expiration date: September 15th | M1=confirmed tree nut allergy test results: Allergic to tree nuts: walnuts (Class 3 reaction), cashews (Class 2 reaction) | M5=allergic reaction incident at Thai restaurant: Allergic reaction from crushed cashews in curry paste at Thai restaurant; used EpiPen for the first time | M4=blood pressure medication decision timeline: If blood pressure still elevated at June check-up, Dr. Chen will consider medication | M2=allergist name and clinic location: Dr. Patel, allergist, clinic on Kensington Rd
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; A single recent home blood pressure reading is temporary status information and does not clearly change the existing June medication decision timeline.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; The evidence is a single home blood pressure reading with an optimistic personal interpretation ('heading in the right direction'), which is tentative and insufficient to update or replace the persistent memory M4 about the June check-up decision timeline; no definitive state change has occurred.

## C — BA-002 / memops-t099

- Evidence: I need to finish Becker 100% by at least two weeks before the exam so I have time for a final review pass
- Current state: M3=Becker FAR progress percentage and date: 58% as of May 3rd | M1=CPA FAR section exam date: June 7th | M2=Kevin's AUD practice exam score: 71
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The evidence states a persistent study-completion goal not represented by the existing memories; it does not change the recorded progress or exam date.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The statement expresses a study planning goal/intention rather than a new persistent fact or a change to an existing memory value; it is tentative/aspirational and does not update, replace, or add a concrete stored attribute.

## B — BA-004 / memops-t279

- Evidence: So I looked into Orijen more and it turns out the protein content might actually be too high for a kitten Mochi's age. The vet's office confirmed that what she's on now is perfectly fine. So I'm sticking with Royal Canin Kitten after all
- Current state: M2=Mochi's next vet appointment date: May 10th | M1=Mochi's current kitten food: Royal Canin Kitten dry food (breeder-recommended)
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms Mochi is staying on Royal Canin Kitten, which is already represented by M1, so no memory change is needed.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms Mochi remains on Royal Canin Kitten dry food, which is already captured in M1; no new or changed persistent information exists to store.

## B — BA-005 / memops-t254

- Evidence: I measured myself at home first thing in the morning against my door frame and got 5'11¼"
- Current state: M2=mother's current height: 5'4" | M1=confirmed current height from March physical: 5'11"
- Benchmark: ADD / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The definite new self-measurement changes the user's stored current height from 5'11" to 5'11¼"; M2 concerns the mother.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The new measurement of 5'11¼" is a more current self-reported height that clearly updates the existing M1 value of 5'11", representing a changed value for the same attribute (the user's current height).

## C — BA-007 / memops-t218

- Evidence: my Marriott Bonvoy Gold status lapsed — I think it was earlier this year or maybe late last year, I'm not exactly sure when
- Current state: M4=Current preferred hotel brand: Hilton | M3=Goal to reach Delta Gold Medallion by year end: Reach Delta Gold Medallion by end of year | M1=Delta SkyMiles membership number: 2847301566 | M2=Current Delta Medallion tier status: Silver Medallion
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The Marriott Bonvoy Gold status lapse is a definite, persistent fact not represented in memory; only the timing is uncertain.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence introduces a Marriott Bonvoy Gold status lapse, but the timing is uncertain ('I think it was earlier this year or maybe late last year'), and no existing candidate memory covers Marriott Bonvoy status, so there is nothing to UPDATE or DELETE; while this could be an ADD candidate, the uncertain/vague language about when it lapsed makes it tentative and insufficient to store as a reliable persistent fact under the frozen policy.

## B — BA-009 / memops-t146

- Evidence: I looked into the Discover thing more and realized a lot of places near me don't accept Discover, so I'm sticking with the Chase Freedom Unlimited for Apple Pay after all
- Current state: M1=primary payment method for everyday purchases: Apple Pay linked to Chase Freedom Unlimited | M2=monthly rent amount paid via Zelle: $1,850
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence reaffirms the existing M1 payment preference, so no long-term memory mutation is needed.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the user is sticking with Chase Freedom Unlimited for Apple Pay, which is already captured in M1; no change to existing memory is warranted.

## C — BA-011 / memops-t081

- Evidence: Before this I lived at 118 Caldwell Street, Apartment 12, in Maplewood. That lease ended on January 31st specifically.
- Current state: M4=mother's home address: 4010 Greenleaf Boulevard, Westbrook | M2=current home ZIP code: 60143 | M1=current home address: 742 Birchwood Lane, Unit 3B, Ashford Heights | M3=PO Box at Ashford Heights post office: PO Box 5587, Ashford Heights post office
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence gives a definite former home address and lease end date, persistent historical information not represented by any candidate memory; it does not change the current address.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a previous address (118 Caldwell Street, Maplewood) with a past lease end date, not a current or new persistent state; the current home address (M1) remains valid and unchanged, so no memory mutation is warranted.

## B — BA-013 / memops-t207

- Evidence: the eSIM transfer from my old Samsung was a nightmare when I first got the phone, took three calls to T-Mobile to sort it out
- Current state: M1=current primary smartphone model: Pixel 8 Pro | M2=Pixel 8 Pro storage capacity: 128GB | M3=Pixel 8 Pro purchase timing: Right after January 25th birthday, late January or early February | M4=Pixel 8 Pro battery charging practice and health: Charges between 20-80%, battery health at 100% per AccuBattery
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a one-time past eSIM transfer difficulty, not a persistent current phone attribute or state requiring long-term memory mutation.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a past one-time eSIM transfer difficulty, which is a transient historical anecdote rather than persistent information worth storing long-term; it does not update or replace any existing memory.

## C — BA-014 / memops-t018

- Evidence: I've blocked out Saturday, May 10th, to install the bathroom fan myself.
- Current state: M2=Purchased bathroom exhaust fan model and cost: Panasonic WhisperCeiling FV-0811VF5, purchased from Home Depot on April 19th for $159 | M1=BrightFix Home Services quote for bathroom exhaust fan replacement: $240 for parts and labor
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence adds a definite scheduled plan to install the fan personally on May 10, which is persistent and not represented by either existing memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; Scheduling a DIY installation date is a temporary/planning note, not a persistent fact that changes or replaces any existing memory, and no new persistent attribute warrants an ADD.

## C — BA-016 / memops-t116

- Evidence: The pharmacy kiosk at CVS just gave me 118/72 today. I think that machine reads low though, my home cuff never goes that low
- Current state: M2=Date user began home blood pressure monitoring: April 15th | M1=User's most recent blood pressure reading: 130/80 | M4=Surgeon who performed user's gallbladder removal: Dr. Patel at St. Luke's Medical Center | M3=Deadline for blood pressure monitoring data review by Dr. Simmons: June 15th
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The user definitively reports a newer blood pressure reading of 118/72, replacing the stored most recent reading; the caveat questions the kiosk’s accuracy but not that it produced that reading.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; The user explicitly doubts the kiosk reading ('I think that machine reads low'), making the new value tentative and uncertain rather than a reliable update to M1; the policy prohibits inferring a definite state change from uncertain language.

## B — BA-017 / memops-t001

- Evidence: HR sent a memo saying her records will be listed as Rebecca Lee going forward because of some policy about using the most recent legal surname.
- Current state: M2=Rebecca's start date on analytics team: February 26th | M1=Name of new colleague on analytics team: Rebecca Thornton | M4=Name of neighbor's daughter who babysits: Priya Rao | M3=Rebecca's probation period duration: 90 days
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; HR states that Rebecca’s recorded name will be Rebecca Lee going forward, clearly replacing the existing Rebecca Thornton name memory.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; HR memo officially changes Rebecca's surname from Thornton to Lee; M1 stores her name and must be updated to reflect the new persistent legal name 'Rebecca Lee'.

## B — BA-018 / memops-t155

- Evidence: Darren said he's leaning toward accepting the offer. He told me he'd decide by the end of May.
- Current state: M2=Shared city and regular hangout routine: Both live in Portland for ~6 years; Tuesday evening ramen on Hawthorne | M4=Darren's Seattle job offer details: Senior DevOps role in Seattle, $152K salary | M1=Best friend's name and relationship origin: Darren Liu, best friend since freshman year at Oregon State | M5=Darren's girlfriend Naomi and relationship duration: Naomi, together about 2 years, opposed to the Seattle move | M3=Darren Liu's birthday: October 17th
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; Leaning toward accepting is tentative, and he has not yet decided, so the evidence does not support a persistent state change.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; Darren is only 'leaning toward' accepting and has not yet decided; the language is tentative with a future decision point (end of May), so no confirmed state change warrants a memory mutation under the policy.

## B — BA-024 / memops-t076

- Evidence: I decided to keep the Citi due date at the 18th after all
- Current state: M2=Chase Sapphire card payment due date: 15th of each month | M4=Second monthly paycheck deposit date: 16th of each month | M3=Google Calendar reminder offset before due dates: 3 days before each due date | M1=Citi Double Cash card payment due date: 18th of every month
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the Citi due date remains the 18th, which is already represented by M1, so no memory mutation is needed.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the Citi due date remains at the 18th, which is already accurately stored in M1; no mutation is warranted as this is a duplicate/confirmation of existing memory.

## B — BA-025 / memops-t188

- Evidence: Kevin moved his C11 exam to May 24
- Current state: M2=C11 exam center location: Pearson VUE, 250 Yonge Street, Toronto | M1=C11 exam date: May 10 | M3=C11 exam flashcard purchase details: Physical flashcard set from CSI, $45
- Benchmark: ADD / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The evidence clearly changes the persistent C11 exam date from May 10 to May 24.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; The new fact explicitly changes the C11 exam date from May 10 to May 24, directly replacing the current value stored in M1.

## B — BA-026 / memops-t192

- Evidence: I just checked the HRIS portal and my official title still shows L6, Senior Software Engineer. Nothing about L6 Plus has been formalized yet, so for the record my level is still plain L6
- Current state: M2=L6 compensation band floor: $185,000 | M3=current base salary after promotion adjustment: $191,500 | M1=current job level and title grade: L6, Senior Software Engineer
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the existing M1 level/title and says the possible L6 Plus change has not been formalized, so no memory mutation is warranted.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the existing M1 memory (L6, Senior Software Engineer) is still accurate; no new or changed persistent fact is introduced, and the L6 Plus mention is explicitly tentative/unformalized.

## B — BA-027 / memops-t041

- Evidence: A few days ago I got a two-factor authentication code from my bank. It was 882471.
- Current state: M4=Thai DoorDash pickup code from last month: 941 | M2=preferred InPost locker location: Greenfield Ave | M3=Mom's pharmacy verification code from mid-March: 3058 | M1=InPost locker pickup code from March 3rd: 7724 | M5=user's apartment number: 149
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The bank two-factor authentication code is temporary and therefore should not be stored as long-term memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; A bank two-factor authentication code is a temporary, one-time-use credential with no persistent value; it does not warrant long-term storage and does not update or replace any existing memory.

## B — BA-029 / memops-t228

- Evidence: Kevin's manager Linda told me today that the official system shows his transfer date as January 2nd because of some payroll alignment thing
- Current state: M3=B04 department office location: 6th floor, Building 2 | M1=Kevin Chen's effective transfer date to B04: January 15th | M2=Manager of B04 department: Linda Zhao
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The official system’s January 2nd date clearly replaces the stored January 15th effective transfer date for Kevin’s transfer to B04.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The official system now shows Kevin Chen's transfer date as January 2nd, which clearly replaces the previously stored date of January 15th in M1; the source is authoritative (manager Linda citing the official system) and the reason (payroll alignment) is explanatory, not tentative.

## B — BA-030 / memops-t126

- Evidence: His HR department confirmed they'll be listing him as "M. Torres" on all new business cards and the company directory starting next quarter. He said that's basically going to be his professional identity going forward.
- Current state: M3=Marcus's consulting firm employer: Whitfield & Associates | M4=Chen Wei's Toronto employer: Ledgerly | M2=Roommate Chen Wei's preferred form of address: Chen Wei | M1=College friend Marcus's preferred form of address: Marcus
- Benchmark: NOOP / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The evidence gives persistent new information about Marcus's professional identity as “M. Torres,” which is not already represented; it does not clearly replace his general preferred form of address.
- Reviewer B: ADD / NONE; applicable=true; ambiguity=LOW; The evidence introduces a new persistent fact—Marcus's professional identity/listing will be 'M. Torres'—which is not represented in any existing memory. M1 stores his preferred form of address as 'Marcus' (informal/personal), while this is a distinct professional identity confirmed by HR, warranting a new memory entry.

## B — BA-031 / memops-t094

- Evidence: My contact at the company just emailed me and said they're rebranding next quarter to GreenWrap Supply. She said all future invoices will use the new name starting in July.
- Current state: M1=candle business packaging supplier name: GreenWrap Co. | M3=wax amount per standard candle: 8 oz (approximately 227 grams) | M2=recent mason jar order total quantity: 144 jars (12 cases × 12 jars per case)
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The supplier has a definite announced name change to GreenWrap Supply, directly updating M1, though the change takes effect starting in July.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The supplier is confirmed to be rebranding from GreenWrap Co. to GreenWrap Supply starting in July, which clearly replaces the current supplier name stored in M1. The change is stated as definite (future invoices will use the new name), not tentative.

## B — BA-033 / memops-t283

- Evidence: earlier this year I was looking into setting up a small planted freshwater fish tank. I spent a few weeks researching it — filter types, substrate, stocking ideas.
- Current state: M1=User's pet cat Mochi: Scottish Fold kitten, female, gray tabby, named Mochi | M2=Friend Derek's pet dog Brisket: French Bulldog puppy named Brisket, got in late February
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a past, temporary research activity and does not establish a current persistent plan or state worth storing.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a past, tentative research phase ('was looking into') with no confirmed persistent outcome such as actually setting up a tank or acquiring fish; it is insufficient to support a durable state change.

## C — BA-034 / memops-t010

- Evidence: The consular officer told me that with the new bilateral agreement, my passport validity will be recognized until December 31, 2025 for travel within the region
- Current state: M2=Wife's passport expiration date: March 7, 2026 | M1=User's passport expiration date: October 31, 2025 | M3=User's target window for passport renewal: June 2025
- Benchmark: NOOP / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The recognized travel-validity date under the bilateral agreement is persistent and distinct from the passport’s existing expiration date, so it is not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a temporary/contextual travel recognition rule under a bilateral agreement, not a change to the passport's actual expiration date (M1 remains October 31, 2025) or the renewal target window (M3). No existing memory is contradicted or replaced, and the bilateral recognition rule is situational rather than a persistent personal attribute worth storing under the supplied candidates.

## C — BA-036 / memops-t156

- Evidence: I set my Google Calendar reminders to go off 3 days before each credit card due date
- Current state: M1=Citi Double Cash card payment due date: 22nd of every month | M2=Chase Sapphire card payment due date: 15th of each month
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The 3-day reminder setting is persistent information not represented by either existing due-date memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a personal calendar reminder behavior, not a change to any stored due date. Both M1 and M2 remain accurate and unchanged; no new persistent fact about due dates or card attributes is introduced.

## B — BA-037 / memops-t104

- Evidence: I called the insurance company and they confirmed the correct policy number is HX-440812. They also told me my coverage effective date was February 1st
- Current state: M1=new health insurance policy number: HX-440812 | M2=daily water intake target: 2.5 liters per day
- Benchmark: UPDATE / M1
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The confirmed policy number duplicates M1, but the coverage effective date of February 1st is new persistent insurance information not represented by either memory.
- Reviewer B: ADD / NONE; applicable=true; ambiguity=LOW; The coverage effective date of February 1st is new persistent information not represented in any existing memory; M1 only stores the policy number. The policy number confirmation is a duplicate of M1 and requires no change.

## D — BA-038 / memops-t023

- Evidence: My wife's sister just told us she's naming her baby Elara too, due in September. My wife said we should switch to Iris to avoid confusion. She's pretty firm about it.
- Current state: M3=Middle name shortlist for daughter: June or Mae | M2=Daughter's due date: July 18th | M1=First-choice name for daughter: Elara
- Benchmark: NOOP / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=MATERIAL; “We should switch to Iris” reports a firm proposal, but not a confirmed change to the current first-choice name, so it is insufficient to update M1.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The wife is described as 'pretty firm' about switching from Elara to Iris, indicating a clear persistent state change to the first-choice name, warranting an UPDATE to M1.

## C — BA-039 / memops-t028

- Evidence: the switch date from SwiftKey to Gboard was March 3rd
- Current state: M2=Gboard keyboard theme: plain dark gray background | M1=phone default input method: Gboard
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The March 3 switch date is persistent historical information not represented by the existing memories; it supplements rather than changes the current Gboard default.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The switch date is new detail but M1 already captures that Gboard is the default input method; the date is supplementary context that does not change or replace any existing memory value, and no existing memory needs updating or deletion.

## C — BA-040 / memops-t187

- Evidence: I started keeping a sticky note on my monitor with all the key dates listed out before any meeting
- Current state: M2=preferred method for communicating dates: Strongly prefers communicating dates in writing (emails, Slack) so they can be double-checked before sending | M1=pattern of misspelling months when stating dates verbally: Tends to mix up months when stating dates verbally under pressure, especially in meetings
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence states an ongoing date-preparation habit that is persistent and not represented by either existing memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; The sticky-note habit is a coping strategy consistent with existing memories (M1 about verbal date errors, M2 about preferring written communication) but does not clearly change or replace any stored value, nor does it introduce a sufficiently distinct persistent fact beyond what is already captured.

## C — BA-041 / memops-t183

- Evidence: My financial advisor recommended I increase the VTSAX contribution to $350 biweekly to max out my annual target
- Current state: M2=Monthly Bitcoin auto-buy on Coinbase: $50 monthly on the 1st via Coinbase | M1=Biweekly VTSAX auto-invest amount: $300
- Benchmark: NOOP / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The advisor’s recommendation does not establish that the biweekly VTSAX contribution was actually changed from $300 to $350.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The advisor's recommendation to increase VTSAX biweekly contribution from $300 to $350 clearly updates the existing value in M1, even though it originates as a recommendation; the user presents it as a directive to act on, replacing the current stored amount.

## C — BA-043 / memops-t230

- Evidence: My coworker Jen referred me to Marcus's gym. She trains with someone named Priya there
- Current state: M4=current deadlift max: 275 lbs (up from 225 lbs in March) | M3=training session cost and commitment: $75 per session, 12-week commitment starting mid-April | M1=personal/fitness trainer name: Marcus Delgado | M2=training session schedule: Tuesdays at 6:30 AM, Thursdays at 7 AM
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence adds persistent referral and gym-relationship information not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence introduces incidental background details (coworker Jen's referral, a trainer named Priya) that are not persistent facts about the user's own training attributes, and nothing in the evidence changes or replaces any existing memory.

## C — BA-045 / memops-t110

- Evidence: I've switched everything to metric now, all my recipes are in grams and milliliters
- Current state: M2=number of mason jar cases in recent order: 12 cases | M1=candle business packaging supplier: GreenWrap Co., based in Portland
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The user states a persistent switch to metric measurements for all recipes, and no candidate memory represents this information.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The new fact about switching recipes to metric units does not duplicate, update, or require deletion of either existing memory (supplier info or mason jar order count), and while it may be worth storing, it is a general operational note about recipe measurement units that doesn't clearly conflict with or replace any current memory value; however, it is also not represented in existing memories—yet the statement is a general process note without a clear persistent attribute to anchor an ADD against existing candidates, making NOOP appropriate as the information is insufficiently specific to a stored object/attribute pair.

## B — BA-049 / memops-t086

- Evidence: The building's new ownership group sent a notice saying all renewal deadlines are being pushed to April 20 across the board. My neighbor got the same letter.
- Current state: M1=Apartment lease renewal notification deadline: April 10 | M2=Community arts program grant application deadline: April 18
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The ownership notice clearly changes the apartment lease renewal deadline from April 10 to April 20; the grant deadline is unrelated.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The building's new ownership group officially changed the lease renewal notification deadline from April 10 to April 20, directly replacing the current value in M1. M2 is unrelated to the building's lease deadlines.

## B — BA-050 / memops-t191

- Evidence: My mom needed help with her pharmacy kiosk pickup in mid-March. The verification code they texted her was 3058.
- Current state: M1=InPost locker pickup code from March 3rd: 7724 | M2=preferred InPost locker location: Greenfield Ave
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The pharmacy kiosk verification code was a temporary one-time code for the user's mother and does not warrant a long-term memory mutation.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The new fact is about the user's mom's pharmacy kiosk verification code, not the user's own persistent information; it is a one-time, third-party code unrelated to the existing InPost locker memories and not worth storing as the user's long-term memory.

## C — BA-051 / memops-t292

- Evidence: Her sabbatical is six months long and she'll be at UC San Diego
- Current state: M3=Dr. Voss sabbatical start date: around June 15th | M2=weekly meeting schedule with Dr. Voss: Thursdays at 10:30 AM | M1=date Dr. Voss became thesis advisor: February 14th
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence adds persistent sabbatical duration and location information not represented by any candidate memory.
- Reviewer B: UPDATE / M3; applicable=true; ambiguity=LOW; The new fact adds persistent details about Dr. Voss's sabbatical (duration: six months, location: UC San Diego) that clearly expand the existing M3 memory about her sabbatical, warranting an update to the same memory object.

## B — BA-054 / memops-t210

- Evidence: My fleet coordinator just messaged me saying the GPS log for February shows 868 miles and that I should use that number going forward
- Current state: M2=Portland hotel stay total cost: $378 for two nights at the Residence Inn on SW Morrison Street | M3=personal report submission rule: Triple-check any dollar amount or headcount before submitting; never file reports after 4 PM | M1=February driving log mileage: 871
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The coordinator’s GPS value of 868 miles clearly replaces the existing February driving-log mileage of 871 for future use.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; The fleet coordinator's authoritative GPS log provides a new definitive value (868 miles) that replaces the current stored February mileage of 871, and the instruction to 'use that number going forward' confirms it as a persistent replacement value.

## B — BA-057 / memops-t259

- Evidence: Marcus texted the group today saying the community center double-booked Tuesdays for the summer, so he's confirmed we'll be switching to Monday evenings starting next month
- Current state: M1=Support group meeting day: Tuesday | M2=Current therapist name and start date: Dr. Patel, started April 8th, office on Birch Avenue
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The confirmed switch to Monday evenings starting next month changes the persistent support group meeting day currently stored as Tuesday.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; Marcus has confirmed the support group is switching from Tuesday to Monday evenings starting next month, which clearly replaces the current meeting day stored in M1.

## C — BA-058 / memops-t273

- Evidence: we need to finalize the name by the end of May so we can get the custom nursery letters ordered — the shop needs six weeks lead time
- Current state: M2=baby due date: July 19th | M1=top baby name pick: Elara
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The end-of-May name-finalization deadline is a persistent actionable plan not represented by either existing memory; it does not establish that Elara is finalized.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence introduces a deadline and ordering logistics, which are temporary/procedural details rather than persistent facts about the baby's name or due date; neither existing memory requires addition, update, or deletion.

## B — BA-060 / memops-t033

- Evidence: Priya looked it up on Lenovo's PSREF database and she says the panel on my exact SKU is listed as 2880 by 1800
- Current state: M1=ThinkPad X1 Carbon Gen 11 screen resolution: 1920x1200 | M2=ThinkPad X1 Carbon Gen 11 warranty expiration: Two-year warranty from February 10, 2024
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The evidence gives a persistent replacement screen resolution for the exact ThinkPad SKU, updating M1 from 1920x1200 to 2880x1800; only minor uncertainty arises from the reported phrasing.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; Priya looked up the exact SKU on Lenovo's PSREF database and found the panel resolution is 2880x1800, which clearly replaces the stored value of 1920x1200 in M1 with a more specific, sourced persistent fact about the same attribute.

## B — BA-061 / memops-t120

- Evidence: my six-month probation review is scheduled for July 15th
- Current state: M1=department at Meridian Consulting Group: Strategic Analytics | M2=direct manager at Meridian Consulting Group: Rachel Tseng, analytics division lead | M3=employee ID number at Meridian Consulting Group: MCG-20250115-47 | M4=colleague David Lam at Meridian Consulting Group: David Lam, colleague in Strategic Analytics department
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The scheduled probation review is a temporary, time-bound event and does not update any existing persistent candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; A scheduled probation review date is a temporary, time-bound event rather than persistent long-term information, and it does not update or replace any existing candidate memory.

## B — BA-062 / memops-t258

- Evidence: Kevin mentioned his legal name is actually spelled Bak — B-A-K — it's a romanization thing. He said the building management keeps getting it wrong.
- Current state: M1=B27 neighbor Kevin's last name: Park | M2=B27 neighbor Kevin's occupation and workplace: Works in radiology at the university hospital, about two years
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; Kevin explicitly clarifies that his legal last name is spelled Bak, replacing the stored last name Park.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; Kevin explicitly corrected the spelling of his last name from 'Park' to 'Bak', directly replacing the current value stored in M1 with a new persistent value for the same attribute.

## C — BA-063 / memops-t163

- Evidence: They don't know the gender yet — they want it to be a surprise
- Current state: M3=baby name finalists: Elara, Margot, and Wren | M4=baby name decision deadline: end of this month | M5=name preferences between spouses: Wife prefers Margot; user leans toward Wren but not strongly | M1=baby's gender: girl | M2=baby's due date: July 19th
- Benchmark: ADD / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The evidence clearly replaces the stored gender value of “girl” with the persistent state that the gender is unknown because it will be a surprise.
- Reviewer B: DELETE / M1; applicable=true; ambiguity=NONE; The new evidence explicitly states they don't know the gender and want it to be a surprise, directly contradicting M1 which asserts the baby's gender is a girl. No replacement value is provided, so DELETE is appropriate rather than UPDATE.

## C — BA-064 / memops-t106

- Evidence: The monitoring period is two months, so the deadline to have enough data for Dr. Simmons is June 15th
- Current state: M2=Date user began home blood pressure monitoring: April 15th | M1=User's most recent blood pressure reading: 136/84
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The June 15th deadline is new persistent information not represented by either candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The June 15th deadline is derivable from the existing M2 start date plus the stated two-month period; it adds no new persistent fact beyond what is already stored, and the statement is contextual/informational rather than a new independent persistent attribute worth storing separately.

## B — BA-066 / memops-t151

- Evidence: Tom Reznik emailed the team that all patient coordination extensions will be migrated to the 4800 block next Monday, so Sarah's extension will become 4817
- Current state: M3=Sarah's office floor and building address at Meridian: Third floor, 401 Lakeshore Drive, Wilmington | M2=Sarah's annual salary at Meridian Health Systems: $58,500 | M1=Sarah's work phone extension at Meridian Health Systems: 4302
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The evidence definitively states that Sarah’s persistent work extension will change from 4302 to 4817, directly updating M1.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The email states Sarah's extension will become 4817 after the migration next Monday, replacing the current value of 4302 in M1. While the change is scheduled rather than already enacted, it is a confirmed planned update with a specific new value, making UPDATE appropriate over NOOP.

## B — BA-069 / memops-t077

- Evidence: Dr. Reyes just emailed me. She said the external lab result was from a mislabeled vial, so it's not mine. The confirmed AMH is still 1.1 ng/mL from the rerun
- Current state: M2=User's current prenatal vitamin: Thorne Basic Prenatal | M1=User's AMH level from fertility hormone panel: 1.1 ng/mL
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The confirmed AMH value remains 1.1 ng/mL, which is already represented by M1; the mislabeled external result does not support a state change.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The confirmed AMH remains 1.1 ng/mL, identical to M1; the evidence is a duplicate/paraphrase of the existing memory with no change in value.

## C — BA-070 / memops-t240

- Evidence: My lease here runs through January 31st of next year
- Current state: M1=date of move to Portland: February 3rd | M2=Portland apartment location: SE Division Street near 26th, Portland
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The lease end date is definite, persistent information not represented by either existing memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The lease end date (January 31st) is new detail but does not change or replace any existing memory value, and the evidence is a factual statement about a lease term rather than a change to move date or apartment location; it could warrant an ADD, but it describes a temporary/time-bound contractual fact rather than a persistent attribute worth storing alongside the existing memories under the policy.

## C — BA-071 / memops-t181

- Evidence: my Chase savings was earning basically 0.01% APY before I moved the money to Marcus
- Current state: M6=Venmo account status: Venmo account deleted in February, no longer active | M4=everyday purchase payment method: Apple Pay linked to Chase Sapphire Preferred card, no cash | M3=amount transferred to Marcus savings from Chase: $8,000 transferred from Chase savings to Marcus savings | M5=Zelle setup for rent payment: Zelle set up through Chase app, used for rent payment to new landlord | M7=BECU credit union account status: BECU credit union account from Seattle era, approximately $200 balance, intending to close | M2=Marcus by Goldman Sachs high-yield savings account: Marcus by Goldman Sachs high-yield savings, 4.5% APY at sign-up in mid-March | M1=primary checking account and direct deposit setup: Chase checking account, salary direct-deposited every two weeks, primary account for all recurring bills
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence adds a definite, persistent historical fact about the Chase savings APY before the transfer, which is not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The statement that Chase savings was earning 0.01% APY is background context explaining the motivation for the already-stored transfer (M3) and Marcus account (M2); it adds no new persistent fact not already represented, and no existing memory needs updating or deletion.

## C — BA-072 / memops-t285

- Evidence: I started using Google Drive's built-in document scanner on my phone around mid-April to digitize receipts
- Current state: M5=offline access configuration for Core_Vault: Offline access enabled for Core_Vault on laptop and tablet | M4=automatic camera roll backup configuration: Automatic camera roll backup enabled to Google Drive on phone | M2=main storage folder name on Google Drive: Core_Vault | M1=default cloud storage service: Google Drive | M3=Google One storage plan tier: 2 TB
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence states a new, ongoing use of Google Drive’s document scanner to digitize receipts, which is persistent information not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a behavioral habit (using Google Drive's document scanner to digitize receipts starting mid-April) that is a transient usage detail, not a persistent configuration or attribute worth storing as a long-term memory, and it is not represented by any existing candidate memory requiring an update or deletion.

## B — BA-073 / memops-t246

- Evidence: I just confirmed with Marcus and the rate stays at $80 for now since I haven't signed the 24-week extension yet
- Current state: M2=12-week training block end date: July 7th | M1=personal trainer session cost: $80 | M3=total sessions in 12-week training block: 24 sessions
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The confirmed current rate of $80 duplicates M1; the unsigned extension does not establish any persistent state change.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The $80 rate is already stored in M1 and the evidence confirms it remains unchanged; no new or updated persistent fact is introduced.

## C — BA-074 / memops-t060

- Evidence: the introductory rate is $1 per week for the first year
- Current state: M2=Adobe Creative Cloud annual subscription cost: $659 | M1=Adobe Creative Cloud annual auto-renewal date: March 15, annually
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The first-year introductory rate is persistent pricing information distinct from the existing unqualified annual subscription cost, so it can coexist as a separate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; The $1/week introductory rate is a temporary promotional price for the first year only, not a persistent replacement for the stored annual subscription cost; the policy excludes temporary or tentative information from triggering a state change.

## C — BA-076 / memops-t166

- Evidence: my son's passport was issued when he was 6 and it's a 5-year one, so it should expire around July or August 2025
- Current state: M1=user passport expiration date: September 14, 2025 | M5=passport renewal processing time: approximately 4 weeks | M2=wife's passport expiration date: March 7, 2026 | M3=user national ID card expiration date: November 2034 | M4=user target month for passport renewal appointment: June 2025
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The son's passport expiry is expressed tentatively as an approximate July or August 2025 date, so it is insufficient to support a persistent state change.
- Reviewer B: ADD / NONE; applicable=true; ambiguity=LOW; The son's passport expiration (approximately July or August 2025) is new persistent information not represented by any existing candidate memory; the approximate range introduces minor wording uncertainty but does not change the clear ADD decision.

## C — BA-080 / memops-t138

- Evidence: I renewed my driver's license last Friday at the DMV, so that one's all taken care of now
- Current state: M1=User's passport expiration date: September 14, 2025 | M2=Wife's passport expiration date: March 7, 2026
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The user definitively reports completing a driver's-license renewal, a persistent fact not represented by either passport memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The new fact concerns a driver's license renewal, which is not represented in any existing memory and is a transient administrative event ('all taken care of now') rather than persistent information worth storing alongside the passport records.

## B — BA-082 / memops-t050

- Evidence: Rachel mentioned in our team meeting that the department is being rebranded to Applied Strategy & Analytics starting next quarter
- Current state: M1=department name at Meridian Consulting Group: Strategic Analytics | M4=start date at Meridian Consulting Group: January 15th | M3=six-month probation review date at Meridian: July 15th | M2=direct manager at Meridian Consulting Group: Rachel Tseng, analytics division lead
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The evidence definitively states that the department name will change to Applied Strategy & Analytics next quarter, updating M1’s persistent department-name value.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The evidence states the department is being rebranded to 'Applied Strategy & Analytics' starting next quarter, which clearly replaces the current department name stored in M1 ('Strategic Analytics'). Minor ambiguity exists only around timing ('next quarter') but the rebrand is stated as a definite future fact, not tentative or hypothetical.

## B — BA-083 / memops-t039

- Evidence: my mom needed help with her pharmacy kiosk and the verification code they texted her was 3058
- Current state: M1=InPost locker package pickup code: 7724 | M2=preferred InPost locker location: Greenfield Ave (not the one by the train station)
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The pharmacy kiosk verification code is a temporary one-time code for the user's mother and does not warrant a long-term memory mutation.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The pharmacy kiosk verification code is a one-time, temporary code for the user's mother, not persistent information about the user, and is unrelated to any existing memory; no long-term memory mutation is warranted.

## B — BA-084 / memops-t111

- Evidence: My friend Tom actually volunteered to be my emergency contact going forward. He confirmed it yesterday, so I'll be switching to Tom Brennan as my primary
- Current state: M3=Karen Liu's phone number: 503-461-2283 | M1=primary emergency contact name: Priya Nair | M2=emergency contact phone number: 520-334-7190
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The confirmed, going-forward switch to Tom Brennan changes the stored primary emergency contact name, though “I'll be switching” is slightly prospective.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The user has confirmed switching their primary emergency contact from Priya Nair to Tom Brennan, which clearly replaces the current value in M1. The phone number in M2 may also need updating, but M1 is the most directly addressed attribute; the name change is unambiguous and persistent.

## B — BA-085 / memops-t082

- Evidence: Turns out the rebranding got shelved. Leadership decided to keep it as Strategic Analytics after all
- Current state: M4=start date at Meridian Consulting Group: January 15th | M1=department name at Meridian Consulting Group: Strategic Analytics | M3=six-month probation review date at Meridian: July 15th | M2=direct manager at Meridian Consulting Group: Rachel Tseng, analytics division lead
- Benchmark: UPDATE / M1
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence confirms the department remains Strategic Analytics, which is already represented by M1, so no memory mutation is needed.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; M1 already stores 'Strategic Analytics' as the department name; the evidence confirms the name remains unchanged, so no mutation is needed.

## C — BA-086 / memops-t035

- Evidence: The tracking period for the spreadsheet runs from late March through April 15th. That's roughly three weeks of data collection across our entire team.
- Current state: M3=ratio of downgraded to upgraded priority incidents: 9 downgraded, 5 upgraded out of initial 14 | M1=production database outage ticket number: INC-20240303-0712 | M2=number of mislabeled priority incidents in personal spreadsheet: 16
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The evidence gives a persistent tracking period and team-wide scope for the spreadsheet that are not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence only describes the tracking period and scope of the spreadsheet (late March through April 15th, roughly three weeks, entire team), which is contextual/descriptive information that does not add new persistent facts, nor does it change, replace, or contradict any existing memory.

## C — BA-089 / memops-t231

- Evidence: My friend Kevin is also writing C11 and his date is May 24
- Current state: M2=C11 exam center location: Pearson VUE, 250 Yonge Street, Toronto | M1=C11 exam date: May 10
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; Kevin’s C11 exam date is persistent information about a different person and is not represented by the existing memories.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The new fact is about Kevin's exam date (May 24), not the user's own C11 exam date stored in M1 (May 10). It does not change, replace, or add any persistent information about the user's own exam details, and is not worth storing as a long-term memory about the user.

## C — BA-091 / memops-t065

- Evidence: There's this coffee shop on 4th Avenue where I go almost every morning. They always spell my name right on the cup, which is honestly one of the main reasons I keep going back.
- Current state: M1=User's last name and its correct spelling: McAllister (capital M, capital A) | M2=Pending task to correct name spelling at dentist office: Call Dr. Huang's office on Elm Street (near the library) to correct name spelling in their system | M3=User's preference for filling out forms: Prefers filling out forms by hand rather than online
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The user describes a persistent near-daily coffee-shop habit and reason for returning, which is not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence is a casual anecdote about a coffee shop habit; it contains no new persistent fact not already represented in memory and introduces no change, replacement, or deletion of any existing memory.

## B — BA-092 / memops-t057

- Evidence: Adobe sent me an email saying they're consolidating billing cycles and my renewal will shift to April 15 going forward
- Current state: M1=Adobe Creative Cloud annual auto-renewal date: April 1 | M2=iCloud+ 200GB monthly renewal date: 17th of each month | M3=Adobe Creative Cloud annual subscription cost: $659 per year
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The evidence clearly changes the persistent Adobe Creative Cloud renewal date from April 1 to April 15 going forward.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=NONE; The evidence explicitly states the Adobe Creative Cloud renewal date is shifting from April 1 to April 15 going forward, directly replacing the current value stored in M1.

## C — BA-093 / memops-t269

- Evidence: my mom mentioned she's going to start using Margaret Ellen Kowalski on all her legal documents going forward since the trust attorney recommended it
- Current state: M1=Mother's full legal name: Margaret Ellen Davies | M2=Father's full legal name: Robert James Kowalski | M3=Father's birthday: September 22nd | M4=Mother's birthday: June 5th
- Benchmark: NOOP / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a planned future name usage, not a completed legal-name change, so it is insufficient to update M1.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The mother intends to use 'Margaret Ellen Kowalski' on all legal documents going forward, replacing the current stored legal name 'Margaret Ellen Davies' in M1. While framed as a future intention, it is a stated persistent change to her legal name, not merely tentative or hypothetical.

## C — BA-097 / memops-t232

- Evidence: my mom introduced Elaine to her book club friends as my 'fiancée' around mid-March, maybe the 18th or 19th
- Current state: M2=Dentist emergency contact form mislabel incident: Wrote 'wife' instead of 'partner' on dentist emergency contact form around March 3rd; corrected at front desk | M1=Elaine's actual relationship status and dating start date: Long-term partner, together since June 2022
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; This is a distinct, definite mislabeling incident not represented by M2 or M1; it does not establish that Elaine’s actual relationship status changed.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=LOW; The mom's introduction of Elaine as 'fiancée' is a third-party characterization, not a confirmed change in the user's own relationship status; the language is uncertain ('maybe') and does not clearly establish an engagement that would replace M1's 'long-term partner' designation.

## C — BA-099 / memops-t299

- Evidence: The bill for both of us came to $47 before tip
- Current state: M4=timing of visit to Olive & Thyme with mom: Late February or early March, weeknight dinner | M3=usual order at Olive & Thyme: Roasted cauliflower flatbread with a side of house green salad | M1=favorite restaurant name and location: Olive & Thyme on Magnolia Boulevard | M2=date and occasion of first visit to Olive & Thyme: February 8th, Clara's birthday lunch
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The bill amount is a new, definite historical detail not represented by any candidate memory, though the specific visit is not explicit in the evidence.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The bill amount ($47 before tip) is a transactional detail from a single visit, not persistent information worth storing long-term, and does not update or replace any existing memory.

## C — BA-100 / memops-t025

- Evidence: I do my walks every morning, seven days a week
- Current state: M5=sister Laura weight and wedding goal: Laura is at 142 lbs, goal 135 lbs before her April wedding | M1=user current weight as of March 12: 187.4 lbs as of March 12 | M4=morning walking trail distance on Greenfield Road: 2.1 miles on Greenfield Road | M3=user weight goal and deadline: Under 180 lbs by end of April | M6=user weight on February 5: 191.0 lbs on February 5 | M2=user weight on January 6: 194.2 lbs on January 6
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The user states a persistent daily walking routine that is not represented by any existing candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The statement that the user walks every morning seven days a week is a general habitual claim without a specific new persistent attribute value not already covered; it is insufficiently specific to store as a distinct long-term memory fact distinct from existing entries, and no existing memory is contradicted or updated by it.

## B — BA-101 / memops-t079

- Evidence: The Alliance Française coordinator told me they're reclassifying me back to B1 for the summer intensive because they changed their placement criteria
- Current state: M3=Company language certification submission deadline: June 30th | M2=User's JLPT N3 exam result: Passed JLPT N3 in December, score 118/180 | M1=User's current French CEFR proficiency level: B2
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The user is being reclassified from the stored French level B2 to B1; the summer-program context creates minor scope uncertainty, but this is a clear current level change.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The Alliance Française coordinator is reclassifying the user's French level from B2 to B1, which clearly updates the current value stored in M1 about the user's French CEFR proficiency level.

## C — BA-103 / memops-t141

- Evidence: Dr. Patel's office confirmed they're relocating to 780 Greystone Blvd starting next month. So my follow-up appointment in September will be at the new location
- Current state: M1=location of allergist clinic where testing was done: 412 Kensington Rd, Suite 200 | M2=EpiPen expiration date: September 15th | M3=tree nut allergy reaction classes for walnuts and cashews: Class 3 for walnuts, Class 2 for cashews
- Benchmark: NOOP / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=LOW; The confirmed future office location is persistent new information; it does not replace M1, which records the historical location where testing was done.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; Dr. Patel's office confirmed a definitive relocation to 780 Greystone Blvd, which clearly replaces the current clinic address stored in M1.

## B — BA-106 / memops-t234

- Evidence: The league coordinator confirmed they'll be switching all spring sessions to Friday evenings starting in May
- Current state: M1=Ethan's weekend soccer league day: Saturday morning | M3=Lily's daycare location and start date: Montessori daycare on Elm Street, started second week of January | M2=Ethan's pediatrician appointment date and details: April 22nd, annual checkup with vision screening
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The confirmed Friday-evening schedule starting in May clearly updates Ethan's stored soccer league day and time.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The league coordinator confirmed a definitive schedule change: spring sessions move from Saturday morning to Friday evenings starting in May, which clearly updates the persistent value stored in M1.

## C — BA-107 / memops-t006

- Evidence: The dermatologist referral from last year is all done — Dr. Huang confirmed the mole was benign back in November
- Current state: M2=pre-appointment fasting requirement: 12-hour fast before blood draw | M5=pre-visit questionnaire completion status: Pre-visit questionnaire not yet completed; must be done before April 17th | M3=user blood type: A-negative | M6=wife Sarah's physical exam date: February 12th | M1=annual physical exam date and time: April 17th at 9:30 AM | M4=father's type 2 diabetes diagnosis: Father diagnosed with type 2 diabetes in January
- Benchmark: ADD / NONE
- Reviewer A: ADD / NONE; applicable=true; ambiguity=NONE; The completed dermatology referral and confirmed benign mole are persistent medical-history information not represented by any candidate memory.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The dermatologist referral outcome (benign mole, November) is a concluded past event not represented in any existing memory, but it is a resolved, closed matter with no ongoing persistent state to track; storing a completed one-time historical finding does not meet the threshold of persistent information worth storing when it has no bearing on future actions or ongoing attributes. Additionally, no existing memory is updated or deleted by this fact.

## B — BA-109 / memops-t027

- Evidence: HR just sent me a message saying they're migrating everyone to a new plan and my updated policy number will be HX-441090 starting next quarter
- Current state: M3=health insurance coverage effective date: February 1st | M4=next doctor follow-up appointment timing: three months from the January visit, sometime in April | M1=new health insurance policy number: HX-440812 | M2=daily water intake target: 2.5 liters per day
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; HR confirms a replacement health insurance policy number, HX-441090, effective next quarter, clearly updating the existing policy number in M1.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; HR's message states the policy number will change to HX-441090, replacing the current stored value HX-440812 in M1; while the change is future ('starting next quarter'), it is a confirmed administrative update from HR rather than tentative or hypothetical language, making UPDATE the appropriate operation.

## B — BA-111 / memops-t134

- Evidence: we started doing regular dinners together around early March, and the first one was March 8th at a Thai place on Elm Street
- Current state: M1=Kevin's dietary classification: vegan | M3=Kevin's previous city of residence: Portland, until 2022 | M2=Kevin's girlfriend's name: Mia | M4=Kevin's favorite cuisine for dining out: Mediterranean
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a past dinner and does not clearly change any stored persistent attribute; one Thai meal does not update Kevin's favorite cuisine.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence describes a specific past dining event (first dinner on March 8th at a Thai place), which is a transient episodic detail rather than persistent long-term information, and it does not clearly update or replace any existing memory such as Kevin's favorite cuisine.

## C — BA-112 / memops-t149

- Evidence: I'm the tech lead on an internal platform migration project. The kickoff was March 12th and we have a target completion of end of June.
- Current state: M4=L6 compensation band floor: $185,000 | M2=current manager: David Chen | M1=current job level and title: L6, Senior Software Engineer, effective March 3rd | M3=current base salary at L6: $191,500
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The tech-lead assignment is tied to a temporary migration project with a stated end-of-June target, so it does not warrant a long-term memory mutation.
- Reviewer B: ADD / NONE; applicable=true; ambiguity=LOW; The evidence introduces new persistent information—tech lead role on an internal platform migration project with a March 12th kickoff and end-of-June target completion—not represented by any existing candidate memory, warranting an ADD.

## C — BA-115 / memops-t015

- Evidence: I got pre-approved for a mortgage through First United Bank, up to $310K, and the pre-approval letter is dated May 8th, 2025
- Current state: M2=previously owned motorcycle (sold): 2016 Yamaha MT-07, sold last month for $4,200 | M1=current daily driver vehicle: 2019 Honda CR-V, purchased January 2023 from a dealership in Plano, Texas with ~38,000 miles
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; A mortgage pre-approval is temporary and time-limited, so it does not warrant a long-term memory mutation.
- Reviewer B: ADD / NONE; applicable=true; ambiguity=NONE; The mortgage pre-approval (First United Bank, up to $310K, dated May 8, 2025) is new persistent financial information not represented by any existing candidate memory, warranting an ADD.

## B — BA-116 / memops-t013

- Evidence: Tom Aldridge confirmed in a meeting today that David will be promoted again to Distinguished Technical Lead starting next quarter
- Current state: M3=Rachel Simmons's start date on the team: April 22nd | M2=Tom Aldridge's job title: VP of Engineering | M1=David Keane's job title: Staff Technical Lead
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=LOW; The confirmed promotion gives a definite future replacement for David Keane's existing job-title memory, effective next quarter.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The evidence states David Keane will be promoted to Distinguished Technical Lead starting next quarter, which clearly replaces his current stored job title of Staff Technical Lead in M1. Although the change is future-dated, it is confirmed and persistent enough to warrant an update under the policy.

## B — BA-120 / memops-t115

- Evidence: the consulate clerk told me their system shows my passport as HG284931. She said that's what's linked to my application file
- Current state: M1=Brazilian passport number: HG284139 | M2=Portuguese citizenship application reference number: PT-2025-04417
- Benchmark: NOOP / NONE
- Reviewer A: UPDATE / M1; applicable=true; ambiguity=NONE; The clerk’s system identifies HG284931 as the passport number linked to the application, clearly replacing the conflicting passport number stored in M1.
- Reviewer B: UPDATE / M1; applicable=true; ambiguity=LOW; The consulate clerk's system shows passport number HG284931, which differs from the stored HG284139. This is a reported current value linked to an official application file, representing a clear update to the same attribute (Brazilian passport number), even if the discrepancy may reflect a data entry error — the new persistent value to store is what the official system holds.

## B — BA-121 / memops-t036

- Evidence: I'm considering adding my coworker Priya Nair as a secondary emergency contact since she sits right next to me at work
- Current state: M4=Karen Liu's work shift schedule: 12-hour shifts at OHSU, 7 AM to 7 PM | M3=Date HR emergency contact form was submitted: March 5th | M5=Date emergency contact was listed at CoreFit gym: March 18th | M2=Primary emergency contact phone number: 503-461-2283 | M1=Primary emergency contact name: Karen Liu
- Benchmark: ADD / NONE
- Reviewer A: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence only tentatively considers adding Priya Nair, so it does not establish a persistent change.
- Reviewer B: NOOP / NONE; applicable=true; ambiguity=NONE; The evidence uses tentative language ('I'm considering'), indicating a hypothetical or uncertain future action rather than a confirmed persistent state change; the policy excludes tentative or hypothetical information from memory mutation.

