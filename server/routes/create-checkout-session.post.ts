import { ACCOUNT_ACCESS } from '@prisma/client';
import Stripe from 'stripe';
import UserAccountService, { AccountWithMembers } from '~~/lib/services/user.account.service';

const config = useRuntimeConfig();
const stripe = new Stripe(config.stripeSecretKey, { apiVersion: '2022-11-15' });

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  let { price_id, account_id} = body;
  account_id = +account_id
  console.log(`session.post.ts recieved price_id:${price_id}, account_id:${account_id}`);

  const userService = new UserAccountService();
  const account: AccountWithMembers = await userService.getAccountById(account_id);
  let customer_id: string
  if(!account.stripe_customer_id){
    // need to pre-emptively create a Stripe user for this account so we know who they are when the webhook comes back
    const owner = account.members.find(member => (member.access == ACCOUNT_ACCESS.OWNER))
    console.log(`Creating account with name ${account.name} and email ${owner?.user.email}`);
    const customer = await stripe.customers.create({ name: account.name, email: owner?.user.email });
    customer_id = customer.id;
    userService.updateAccountStipeCustomerId(account_id, customer.id);
  } else {
    customer_id = account.stripe_customer_id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [
      {
        price: price_id,
        // For metered billing, do not pass quantity
        quantity: 1,
      },
    ],
    // {CHECKOUT_SESSION_ID} is a string literal; do not change it!
    // the actual Session ID is returned in the query parameter when your customer
    // is redirected to the success page.
    success_url: `${config.stripeCallbackUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.stripeCallbackUrl}/cancel`,
    customer: customer_id
  });

  if(session?.url){
    return sendRedirect(event, session.url, 303);
  } else {
    return sendRedirect(event, `${config.stripeCallbackUrl}/fail`, 303);
  }
});


