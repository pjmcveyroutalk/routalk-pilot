# Routalk Pilot Recovery Checkpoint

Checkpoint date: 2026-08-28.

## Known-good baselines
- Control repository: `pjmcveyroutalk/routalk-pilot`.
- Control baseline at Pass 7 completion: `8b8b3dcbd7549b683e97a07e02ac8db20651b81e`.
- External verification target: `pjmcveyroutalk/sport-my-fitness`.
- Pass 8 verifier merge: `27ee274c4ee36cac3e4b88a85c7b1fcf987721d0`.
- Pass 8 final E2E merge: `7bbdaf87fb0aa86810928f28037bd1806b197d04`.

## Protected canonical responsibilities
Phone UI -> Queue API -> Command Store -> Processor -> Protected Merge -> Production Verification.

## Destructive-change gate
Before deleting, retiring, or replacing any existing repository artifact:
1. verify the current main revision;
2. inventory every path affected;
3. classify each path as canonical, inactive historical, diagnostic, evidence, or unknown;
4. prove no canonical code imports, links, dispatches to, or depends on a retirement target;
5. preserve required historical evidence in documentation/archive;
6. confirm rollback to the frozen revision is straightforward;
7. make destructive cleanup narrowly scoped and independently reviewable.

This checkpoint authorizes no deletion by itself.
