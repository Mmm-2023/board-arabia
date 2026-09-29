import { deliverDealRoomInvite, sendDealRoomInvite } from '../_shared/deal_room.ts'
import { handleDealRoom } from '../_shared/deal_room_http.ts'
import { openDealGate } from '../_shared/deal_room_session.ts'

Deno.serve((req) =>
  handleDealRoom(req, 'invite', {
    open: openDealGate,
    deliverInvite: (job) => deliverDealRoomInvite(sendDealRoomInvite(job)),
  }),
)
