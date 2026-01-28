# Project Permissions Matrix

Roles: OWNER, ADMIN, MEMBER

| Action | OWNER | ADMIN | MEMBER |
| --- | --- | --- | --- |
| Project read | yes | yes | yes |
| Project update | yes | yes | no |
| Project delete | yes | yes | no |
| Member list | yes | yes | yes |
| Member manage | yes | yes | no |
| Invitation list | yes | yes | no |
| Invitation manage | yes | yes | no |
| Phase manage | yes | yes | yes |
| Milestone manage | yes | yes | yes |
| Checkin read | yes | yes | yes |
| Checkin write | yes | yes | yes* |
| Achievement read | yes | yes | yes |
| Achievement write | yes | yes | yes |
| Snapshot manage | yes | yes | yes |
| Meeting agenda manage | yes | yes | yes |
| Assignment read | yes | yes | yes |
| Blocker read | yes | yes | yes |

* MEMBER can only write checkins for self (member_user_id == current user).
