# CXOS + Coxswain — End-User Scenario (Retail Holiday Returns Surge)
**Date:** 2026-08-08
**Role:** End user — Maya Chen, CX Program Lead, National Retail Brand
**Workspace:** ~/CXOS (domain-agnostic, retail pack)
**Engine:** ~/coxswain (Qwen3 32B scout 8B via Ollama, offline)
**Goal:** Stand up a new CX program for holiday returns surge, get to healthy board in one session.

---
=== Scenario: Maya Chen, CX Program Lead ===
Maya wants to handle holiday returns surge: 3x volume, loyalty tie-in, store pickup fallback.

Maya starts by checking the OS health and fleet board.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx doctor --offline
```
error: unknown option '--offline'
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx board
```
CXOS board  specs=4 deployed=3 proposals_open=0 tasks_open=0 daemons=0
core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: Customer experience for a national retail brand: returns and refunds, loyalty pr
fin-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: financial services: account inquiry, loan support, fraud alert, onboarding, rete
health-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: healthcare: appointment scheduling, claims, prior authorization, benefits, reten
starter  [R=d D=m T=m] deps=- prop=0+0c tasks_open=0 done=0 daemon=off
  idea: starter CX program — replace idea and run build
path: list_specs → load_each → rollup → emit
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx catalog --pack default 2>&1 | head -n 80
```
CXOS catalog  pack=default v=2026.08.0 source=cx-intelligence-slm
domain billing  Billing  intents=4
  intent billing.payment_issue  Payment Issue
  intent billing.billing_inquiry  Billing Inquiry
  intent billing.refund_request  Refund Request
  intent billing.plan_change  Plan Change
domain technical_support  Technical Support  intents=4
  intent technical_support.connectivity  Connectivity Issue
  intent technical_support.device_issue  Device Issue
  intent technical_support.app_error  Application Error
  intent technical_support.service_outage  Service Outage
domain account  Account Management  intents=4
  intent account.account_creation  Account Creation
  intent account.account_modification  Account Modification
  intent account.password_reset  Password Reset
  intent account.cancellation  Cancellation
domain sales  Sales  intents=4
  intent sales.product_inquiry  Product Inquiry
  intent sales.upgrade  Upgrade Request
  intent sales.new_service  New Service
  intent sales.pricing  Pricing Information
domain general  General  intents=4
  intent general.general_inquiry  General Inquiry
  intent general.feedback  Feedback
  intent general.complaint  Complaint
  intent general.compliment  Compliment
domain health_enrollment  Health Benefits Enrollment (Medicare/Medicaid/ACA)  intents=6
  intent health_enrollment.medicare_enrollment  Medicare Enrollment
  intent health_enrollment.medicaid_enrollment  Medicaid Enrollment
  intent health_enrollment.aca_marketplace_enrollment  ACA Marketplace Enrollment
  intent health_enrollment.eligibility_inquiry  Eligibility Inquiry
  intent health_enrollment.coverage_appeal  Coverage Appeal / Grievance
  intent health_enrollment.premium_payment  Premium Payment
domain tax_services  IRS Taxpayer Services  intents=4
  intent tax_services.tax_notice_inquiry  Tax Notice Inquiry
  intent tax_services.refund_status  Refund Status
  intent tax_services.payment_plan  Payment Plan / Installment
  intent tax_services.identity_verification  Identity Verification
domain veterans_services  Veterans Services (VA)  intents=3
  intent veterans_services.va_benefits_claim  VA Benefits Claim
  intent veterans_services.va_healthcare_enrollment  VA Healthcare Enrollment
  intent veterans_services.claim_status  Claim Status
domain child_support  Child Support Enforcement  intents=3
  intent child_support.support_payment_status  Support Payment Status
  intent child_support.support_case_modification  Support Case Modification
  intent child_support.enforcement_action  Enforcement Action
domain compliance  Compliance & Safety (refusal / PII)  intents=4
  intent compliance.eligibility_determination_request  Eligibility Determination Request (rights-impacting)
  intent compliance.pii_disclosure_request  PII Disclosure Request
  intent compliance.third_party_info_request  Third-Party Information Request
  intent compliance.out_of_scope_advice  Out-of-Scope / Improper Advice
kpis (9):
  total_contacts  Total Contacts  unit=count
  sla_compliance_rate  SLA Compliance Rate  unit=percent
  avg_wait_time  Average Wait Time  unit=seconds
  deflection_rate  Deflection Rate  unit=percent
  avg_contact_value  Average Contact Value  unit=currency
  high_priority_contacts  High Priority Contacts  unit=count
  fcr_rate  First Contact Resolution Rate  unit=percent
  aht_seconds  Average Handle Time  unit=seconds
  csat  Customer Satisfaction  unit=score
nbaRules (17):
  [100] CHURN_RISK_HIGH → retention_offer (retention/critical)
  [95] CHURN_FINAL → escalate_retention_specialist (escalation/critical)
  [92] VIP_PRIORITY_ROUTING → priority_route_to_senior_agent (routing/high)
  [90] COMPLAINT_HANDLING → activate_complaint_protocol (protocol/high)
  [88] SLA_AT_RISK → queue_rebalance_and_escalate (routing/high)
  [85] CROSS_CHANNEL_FRUSTRATION → route_to_senior_omnichannel_specialist (routing/high)
  [80] BILLING_DISPUTE_STUCK → escalate_to_supervisor (escalation/high)
  [75] REPEATED_TECH_ISSUE → proactive_outreach_and_escalate (proactive/high)
  [74] HIGH_EFFORT_RECOVERY → effort_recovery_protocol (recovery/high)
  [60] UPGRADE_OPPORTUNITY → present_upsell_offer (sales/medium)
  [55] DIGITAL_DEFLECTION → offer_self_service_portal (deflection/medium)
  [50] NEW_CUSTOMER_ONBOARDING → activate_onboarding_guide (onboarding/medium)
  [40] PASSWORD_RESET_ASSIST → redirect_to_self_service_reset (deflection/low)
  [30] POSITIVE_FEEDBACK_FOLLOWUP → send_satisfaction_survey (engagement/low)
  [99] RIGHTS_IMPACTING_HUMAN_REVIEW → escalate_to_human_eligibility_determination (escalation/high)
  [98] PII_PROTECTION → refuse_and_verify_identity (protocol/high)
  [97] OUT_OF_SCOPE_REFUSAL → refuse_out_of_scope_advice (protocol/medium)
channels: chat, email, phone, phone_transcript, social_media, in_app, sms
```

She sees 3 healthy specs (core retail, fin-core, health-core) and wants a new one for holiday surge.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx run holiday-returns-2026 "Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty points on returns, store pickup fallback when home pickup fails, and retention offers for high-value customers" --target all
```
runtime mode=offline platform=down url=-
wiring artifacts=offline local=offline aws=offline
compose path: load_config → force_offline → emit
creating CX spec "holiday-returns-2026"
idea: Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty points on returns, store pickup fallback when home pickup fails, and retention offers for high-value customers
requirements: 2
approving requirements for "holiday-returns-2026"
building holiday-returns-2026 targets=artifacts,local,aws mode=offline
  build artifacts: ok steps=6 artifacts=6 deployed=true wiring=offline
  build local: ok steps=1 artifacts=3 deployed=true wiring=offline
  build aws: ok steps=2 artifacts=2 deployed=true wiring=offline
  status artifacts: healthy  artifactCount=6 missingCount=0
  status local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  status aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
  simulate local: total_contacts:86.2/100 sla_compliance_rate:76.7/89 avg_wait_time:103.4/120 deflection_rate:75.0/87
  report artifacts: healthy
  report local: healthy
  report aws: healthy
summary: Offline report for holiday-returns-2026: 3 target(s) with deployments. Use cox cx status for details.
ok=true deployments=artifacts,local,aws
path: build: create_spec -> approve:requirements -> seed_design -> ... -> deploy:local -> build:aws -> deploy:aws | status: status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> aggregate_status | simulate: simulate_route -> simulate:local -> simulate:local | report: aggregate_report -> scout_summary -> recommend_nba | other: cx_run -> load_workspace -> route_targets -> ... -> load_workspace -> emit -> emit
path_full: cx_run -> create_spec -> approve:requirements -> ... -> emit -> recommend_nba -> emit
next steps:
  cox cx console holiday-returns-2026     # poll status, propose gated NBA
  cox cx apply holiday-returns-2026 <id>   # apply a proposal → task
  cox cx board               # multi-spec ops board
  cox cx brief holiday-returns-2026       # executive brief
  cox cx cab-export holiday-returns-2026  # CAB change package
  cox cx daemon start holiday-returns-2026 # long-running watch loop
```

Maya checks the new program's health and executive brief.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx status holiday-returns-2026
```
CX spec "holiday-returns-2026"
idea: Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty points on returns, store pickup fallback when home pickup fails, and retention offers for high-value customers
phases: {"requirements":"approved","design":"approved","tasks":"missing"}
requirements: 2
design journeys: 5
  artifacts: healthy  artifactCount=6 missingCount=0
  local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
summary score: 100 (healthy=3 degraded=0 down=0 errors=0)
path: load_workspace -> status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> emit
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx brief holiday-returns-2026
```
# CXOS Executive Brief: holiday-returns-2026

Generated: 2026-08-09T03:08:53.242Z

## Program

- **Idea:** Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty points on returns, store pickup fallback when home pickup fails, and retention offers for high-value customers
- **Phases:** requirements=approved · design=approved · tasks=missing
- **Deployments:** artifacts, local, aws

## Health

- Status not polled in this brief (run `cox cx status holiday-returns-2026` for live score).

- **Score trail:** 100

## Work queue

- **Proposals open/claimed:** 0
- **Tasks open:** 0 (pending=0 in_progress=0)
- **Tasks done:** 0
- **Tasks cancelled:** 0

## Design footprint

- Journey maps: 5
- Requirements: 2

## Controls

- AWS: plan-only (`cox cx export-aws holiday-returns-2026`); human applies CFN.
- Mutations: console/daemon propose only; `apply` creates tasks + remediation notes.
- Close-out: `cox cx task holiday-returns-2026 <taskId> done` resolves linked proposals.

## Suggested next steps

```bash
pnpm cox cx status holiday-returns-2026 --live
pnpm cox cx console holiday-returns-2026 --live
pnpm cox cx board
pnpm cox cx cab-export holiday-returns-2026
```

---
*CXOS closed-world brief — no model required.*

path: load_workspace → render_brief → emit
```

She wants to see the fleet and the work queue.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx board
```
CXOS board  specs=5 deployed=4 proposals_open=0 tasks_open=0 daemons=0
core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: Customer experience for a national retail brand: returns and refunds, loyalty pr
fin-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: financial services: account inquiry, loan support, fraud alert, onboarding, rete
health-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: healthcare: appointment scheduling, claims, prior authorization, benefits, reten
holiday-returns-2026  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty poi
starter  [R=d D=m T=m] deps=- prop=0+0c tasks_open=0 done=0 daemon=off
  idea: starter CX program — replace idea and run build
path: list_specs → load_each → rollup → emit
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx queue 2>&1 | head -n 80
```
CXOS queue  proposals=0 tasks=0 specs_with_work=0
(queue empty — cox cx operate <name> or console to generate work)
path: list_specs → load_proposals_tasks → sort → emit
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx fleet-status 2>&1 | head -n 80
```
CXOS fleet  specs=5 deployed=4 proposals_open=0 tasks_open=0 daemons=0
CX spec "core"
idea: Customer experience for a national retail brand: returns and refunds, loyalty program, store pickup, online order support, and retention
phases: {"requirements":"approved","design":"approved","tasks":"missing"}
requirements: 2
design journeys: 5
  artifacts: healthy  artifactCount=6 missingCount=0
  local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
summary score: 100 (healthy=3 degraded=0 down=0 errors=0)
health history (last 2): 100 → 100
path: load_workspace -> status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> emit
CX spec "fin-core"
idea: financial services: account inquiry, loan support, fraud alert, onboarding, retention
phases: {"requirements":"approved","design":"approved","tasks":"missing"}
requirements: 2
design journeys: 5
  artifacts: healthy  artifactCount=6 missingCount=0
  local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
summary score: 100 (healthy=3 degraded=0 down=0 errors=0)
path: load_workspace -> status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> emit
CX spec "health-core"
idea: healthcare: appointment scheduling, claims, prior authorization, benefits, retention
phases: {"requirements":"approved","design":"approved","tasks":"missing"}
requirements: 2
design journeys: 5
  artifacts: healthy  artifactCount=6 missingCount=0
  local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
summary score: 100 (healthy=3 degraded=0 down=0 errors=0)
path: load_workspace -> status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> emit
CX spec "holiday-returns-2026"
idea: Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty points on returns, store pickup fallback when home pickup fails, and retention offers for high-value customers
phases: {"requirements":"approved","design":"approved","tasks":"missing"}
requirements: 2
design journeys: 5
  artifacts: healthy  artifactCount=6 missingCount=0
  local: healthy  artifactCount=3 missingCount=0 activeJourneys=1
  aws: healthy  artifactCount=4 missingCount=0 liveMutation=0
summary score: 100 (healthy=3 degraded=0 down=0 errors=0)
health history (last 2): 100 → 100
path: load_workspace -> status_all -> status:artifacts:healthy -> status:local:healthy -> status:aws:healthy -> emit
starter  (no deployments) prop=0 tasks_open=0
path: fleet_board → status_each → emit
```

Maya wants to see journeys and NBA for the new program.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx journeys --pack default 2>&1 | head -n 60
```
CXOS journeys  pack=default  count=7
billing_dispute  stages=6  terminal=resolved,abandoned  triggers=billing.refund_request,billing.billing_inquiry
technical_troubleshooting  stages=7  terminal=resolved,abandoned  triggers=technical_support.connectivity,technical_support.device_issue,technical_support.app_error
new_account_setup  stages=6  terminal=active,abandoned  triggers=account.account_creation,sales.new_service
churn_prevention  stages=6  terminal=retained,cancelled  triggers=account.cancellation
service_upgrade  stages=6  terminal=completed,abandoned  triggers=sales.upgrade,sales.product_inquiry,sales.pricing
benefits_enrollment  stages=7  terminal=enrolled,abandoned  triggers=health_enrollment.medicare_enrollment,health_enrollment.medicaid_enrollment,health_enrollment.aca_marketplace_enrollment,veterans_services.va_healthcare_enrollment
eligibility_appeal  stages=6  terminal=resolved,abandoned  triggers=health_enrollment.coverage_appeal,child_support.enforcement_action
path: load_ontology → list_journeys → emit
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx nba "customer wants to return holiday gift, loyalty member, store pickup failed" 2>&1 | head -n 40
```
usage: cox cx nba journey=… stage=… [confidence=0.9] [field=value …]
```

She runs one operate tick and checks proposals.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx operate holiday-returns-2026 2>&1 | head -n 60
```
CXOS operate holiday-returns-2026
runtime mode=offline platform=down url=-
wiring artifacts=offline local=offline aws=offline
compose path: load_config → force_offline → emit
console tick @ 2026-08-09T03:08:54.421Z
  [none] artifacts healthy — no action
    path: target:artifacts → health:healthy → route:none → emit
  [none] local healthy — no action
    path: target:local → health:healthy → route:none → emit
  [none] aws healthy — no action
    path: target:aws → health:healthy → route:none → emit
path: load_strong → poll_status → emit
(no new proposals to persist)
(proposals are human-gated - no mutations applied)
board holiday-returns-2026: prop_open=0 claimed=0 tasks_open=0 daemon=off
next: cox cx proposals holiday-returns-2026
next: cox cx claim holiday-returns-2026 <proposalId>
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx proposals holiday-returns-2026 2>&1 | head -n 60
```
(no open proposals for holiday-returns-2026)
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx tasks holiday-returns-2026 2>&1 | head -n 60
```
tasks holiday-returns-2026: open=0 pending=0 in_progress=0 done=0 cancelled=0 total=0
(no open tasks for holiday-returns-2026)
```

She exports a CAB package and dashboard for the change board.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx cab-export holiday-returns-2026 ./cx-cab-holiday 2>&1 | head -n 40
```
CAB package for "holiday-returns-2026"
out: /Users/chadhendren/CXOS/cx-cab-holiday
files: aws/template.yaml, aws/APPLY.md, aws/architectureDoc.json, aws/agentDefinition.json, proposals.json, tasks.json, deployments.json, BRIEF.md, MANIFEST.md
path: load_workspace → copy_aws → copy_remediations → write_state → write_brief → emit
next: review MANIFEST.md + aws/APPLY.md (human CFN only)
```

## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx dashboard ./cxos-dashboard-holiday.html 2>&1 | head -n 20
```
wrote CXOS dashboard /Users/chadhendren/CXOS/cxos-dashboard-holiday.html
fleet specs=5 proposals=0 tasks=0
path: board → queue → render_html → emit
```

## $ ls -lh ./cx-cab-holiday 2>&1 | head -n 20
```
total 40
drwxr-xr-x@ 6 501  staff   192B Aug  8 22:08 aws
-rw-r--r--@ 1 501  staff   1.2K Aug  8 22:08 BRIEF.md
-rw-r--r--@ 1 501  staff   2.4K Aug  8 22:08 deployments.json
-rw-r--r--@ 1 501  staff   531B Aug  8 22:08 MANIFEST.md
-rw-r--r--@ 1 501  staff    65B Aug  8 22:08 proposals.json
drwxr-xr-x@ 2 501  staff    64B Aug  8 22:08 remediations
-rw-r--r--@ 1 501  staff    61B Aug  8 22:08 tasks.json
```

## $ ls -lh ./cxos-dashboard-holiday.html 2>&1 | head -n 10
```
-rw-r--r--@ 1 501  staff   4.6K Aug  8 22:08 ./cxos-dashboard-holiday.html
```

Final board after holiday program added.
## $ node /Users/chadhendren/coxswain/packages/cli/dist/main.js --cwd /Users/chadhendren/CXOS cx board
```
CXOS board  specs=5 deployed=4 proposals_open=0 tasks_open=0 daemons=0
core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: Customer experience for a national retail brand: returns and refunds, loyalty pr
fin-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: financial services: account inquiry, loan support, fraud alert, onboarding, rete
health-core  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: healthcare: appointment scheduling, claims, prior authorization, benefits, reten
holiday-returns-2026  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0 done=0 daemon=off
  idea: Holiday returns surge for national retail: 3x return volume Dec-Jan, loyalty poi
starter  [R=d D=m T=m] deps=- prop=0+0c tasks_open=0 done=0 daemon=off
  idea: starter CX program — replace idea and run build
path: list_specs → load_each → rollup → emit
```

---
Scenario complete. Maya now has a new CX program holiday-returns-2026 with 5 retail journeys, healthy artifacts/local/aws, and a CAB package for the change board.
