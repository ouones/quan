// Sub-Store Script Operator: add/override dialer-proxy for all proxies in a subscription.
// Usage in Sub-Store:
//   Script Operator URL: https://raw.githubusercontent.com/desicend/quan/main/substore-dialer-proxy.js#dialerProxy=日本节点
//   Change dialerProxy to the exact Mihomo/OpenClash proxy-group name you want as the front relay.
//
// Examples:
//   #dialerProxy=日本节点
//   #dialerProxy=香港节点
//   #dialerProxy=美国节点
//
// Notes:
// - Apply this only to landing-node subscriptions, not relay/front-node subscriptions.
// - The dialerProxy value must exactly match an existing proxy-group/proxy name in Mihomo/OpenClash.
// - This script intentionally uses older JavaScript syntax for better Sub-Store compatibility.

function getDialerProxy() {
  var options = typeof $arguments !== "undefined" && $arguments ? $arguments : {};
  return options.dialerProxy || options.dialer || options.proxy || "日本节点";
}

function operator(proxies, targetPlatform) {
  proxies = proxies || [];
  var dialerProxy = getDialerProxy();

  return proxies.map(function(proxy) {
    var next = Object.assign({}, proxy);
    next["dialer-proxy"] = dialerProxy;
    return next;
  });
}
