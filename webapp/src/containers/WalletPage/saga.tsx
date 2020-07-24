import { call, put, takeLatest, select } from 'redux-saga/effects';
import * as log from '../../utils/electronLogger';
import {
  fetchPaymentRequest,
  fetchPaymentRequestsSuccess,
  fetchPaymentRequestsFailure,
  fetchWalletTxnsRequest,
  fetchWalletTxnsSuccess,
  fetchWalletTxnsFailure,
  addReceiveTxnsRequest,
  addReceiveTxnsSuccess,
  addReceiveTxnsFailure,
  fetchSendDataFailure,
  fetchSendDataRequest,
  fetchSendDataSuccess,
  fetchWalletBalanceRequest,
  fetchWalletBalanceSuccess,
  fetchWalletBalanceFailure,
  removeReceiveTxnsRequest,
  removeReceiveTxnsSuccess,
  removeReceiveTxnsFailure,
  fetchPendingBalanceRequest,
  fetchPendingBalanceSuccess,
  fetchPendingBalanceFailure,
} from './reducer';
import {
  handelGetPaymentRequest,
  handelAddReceiveTxns,
  handelFetchWalletTxns,
  handleSendData,
  handleFetchWalletBalance,
  handelRemoveReceiveTxns,
  handleFetchPendingBalance,
} from './service';
import queue from '../../worker/queue';
import store from '../../app/rootStore';
import showNotification from '../../utils/notifications';
import { I18n } from 'react-redux-i18n';
import uniqBy from 'lodash/uniqBy';
import { WALLET_TXN_PAGE_SIZE } from '../../constants';

const getDistincRecords = (arr: any[]) => {
  const distict = uniqBy(arr, 'txnId');
  const selected = distict.slice(0, WALLET_TXN_PAGE_SIZE);
  let count = 0;
  if (distict.length === arr.length) {
    return {
      count: 5,
      selected,
    };
  }

  if (distict.length > arr.length / 2) {
    const rejected = distict.slice(WALLET_TXN_PAGE_SIZE);
    rejected.forEach((val) => {
      if (arr.findIndex((item) => item.txnId === val.txnId) !== -1) {
        count += 2;
      } else {
        count += 1;
      }
    });
  }
  return {
    count,
    selected,
  };
};

function fetchWalletBalance() {
  queue.push(
    { methodName: handleFetchWalletBalance, params: [] },
    (err, result) => {
      if (err) {
        showNotification(I18n.t('alerts.walletBalanceFailure'), err.message);
        store.dispatch(fetchWalletBalanceFailure(err.message));
        log.error(err);
        return;
      }
      store.dispatch(fetchWalletBalanceSuccess(result));
    }
  );
}

function fetchPendingBalance() {
  queue.push(
    { methodName: handleFetchPendingBalance, params: [] },
    (err, result) => {
      if (err) {
        showNotification(I18n.t('alerts.pendingBalanceFailure'), err.message);
        store.dispatch(fetchPendingBalanceFailure(err.message));
        log.error(err);
        return;
      }
      store.dispatch(fetchPendingBalanceSuccess(result));
    }
  );
}

export function* addReceiveTxns(action: any) {
  try {
    const result = yield call(handelAddReceiveTxns, action.payload);
    yield put(addReceiveTxnsSuccess(result));
  } catch (e) {
    showNotification(I18n.t('alerts.addReceiveTxnsFailure'), e.message);
    yield put(addReceiveTxnsFailure(e.message));
    log.error(e);
  }
}

export function* removeReceiveTxns(action: any) {
  try {
    const result = yield call(handelRemoveReceiveTxns, action.payload);
    yield put(removeReceiveTxnsSuccess(result));
  } catch (e) {
    showNotification(I18n.t('alerts.removeReceiveTxnsFailure'), e.message);
    yield put(removeReceiveTxnsFailure(e.message));
    log.error(e);
  }
}

export function* fetchPayments() {
  try {
    const data = yield call(handelGetPaymentRequest);
    yield put(fetchPaymentRequestsSuccess(data));
  } catch (e) {
    showNotification(I18n.t('alerts.paymentRequestsFailure'), e.message);
    yield put({ type: fetchPaymentRequestsFailure.type, payload: e.message });
    log.error(e);
  }
}

function* fetchWalletTxns(action) {
  const { currentPage: pageNo, pageSize } = action.payload;
  const { skipTransaction } = yield select((state) => state.wallet);
  let updatedPage = pageNo;
  let updatedSkipPage = false;
  let previousPagePresent = false;
  let updatedPageSize = pageSize;
  if (skipTransaction[pageNo - 1]) {
    updatedPage = skipTransaction[pageNo - 1];
    previousPagePresent = true;
    updatedPageSize = 10;
    updatedSkipPage = true;
  }
  if (pageNo === 1) {
    updatedPageSize = 10;
  }
  queue.push(
    {
      methodName: handelFetchWalletTxns,
      params: [updatedPage, updatedPageSize, updatedSkipPage],
    },
    (err, result) => {
      if (err) {
        store.dispatch(fetchWalletTxnsFailure(err.message));
        log.error(err);
        return;
      }
      if (result && result.walletTxns) {
        const { count, selected } = getDistincRecords(result.walletTxns);
        const updatedResult = Object.assign({}, result, {
          walletTxns: selected,
        });
        store.dispatch(
          fetchWalletTxnsSuccess({
            ...updatedResult,
            skipTransaction: Object.assign({}, skipTransaction, {
              [pageNo]: updatedPageSize + updatedPage - count,
            }),
          })
        );
      } else {
        showNotification(I18n.t('alerts.walletTxnsFailure'), 'No data found');
        store.dispatch(fetchWalletTxnsFailure('No data found'));
      }
    }
  );
}

function fetchSendData() {
  queue.push({ methodName: handleSendData, params: [] }, (err, result) => {
    if (err) {
      showNotification(I18n.t('alerts.sendDataFailure'), err.message);
      store.dispatch(fetchSendDataFailure(err.message));
      log.error(err);
      return;
    }
    if (result) store.dispatch(fetchSendDataSuccess({ data: result }));
    else {
      showNotification(I18n.t('alerts.sendDataFailure'), 'No data found');
      store.dispatch(fetchSendDataFailure('No data found'));
    }
  });
}

function* mySaga() {
  yield takeLatest(addReceiveTxnsRequest.type, addReceiveTxns);
  yield takeLatest(removeReceiveTxnsRequest.type, removeReceiveTxns);
  yield takeLatest(fetchPaymentRequest.type, fetchPayments);
  yield takeLatest(fetchWalletTxnsRequest.type, fetchWalletTxns);
  yield takeLatest(fetchSendDataRequest.type, fetchSendData);
  yield takeLatest(fetchWalletBalanceRequest.type, fetchWalletBalance);
  yield takeLatest(fetchPendingBalanceRequest.type, fetchPendingBalance);
}

export default mySaga;
