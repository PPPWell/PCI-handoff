"use client";
import type {ReactNode} from 'react';import type {MerchantState} from '@/lib/merchant/types';import {merchantFlowVisible} from '@/lib/merchant/session';import {useMerchantSession} from './MerchantSessionProvider';import {MerchantScreen} from './MerchantScreen';
export function MerchantVoucherGate({token,state,children}:{token:string;state:MerchantState;children:ReactNode}){const [flow]=useMerchantSession();return merchantFlowVisible(state.kind,flow)?<MerchantScreen token={token} state={state} />:children;}
