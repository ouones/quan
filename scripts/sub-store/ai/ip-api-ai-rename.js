/**
 * AI 节点重命名脚本 + ip-api ISP 增强版
 *
 * 用法：
 * - url/model/key/nameExample 沿用原 AI 脚本参数
 * - 默认会读取节点 server/address/hostname，调用 ip-api 获取 isp/as/countryCode/city/query
 * - 发给 AI 的对象会包含：id、name、isp、as、countryCode、city、query，以及 fields 指定的字段
 */
async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const {
    timeout = 60000, // OpenAI 兼容接口请求超时, 单位毫秒
    ipApiTimeout = 8000, // ip-api 请求超时, 单位毫秒
    ipBatchSize = 5, // ip-api 每批并发数量
    ipBatchInterval = 1500, // ip-api 每批之间的等待时间, 单位毫秒
    ipRetry = 1, // ip-api 查询失败后的重试次数, 主要用于 429 限速
    url = '', // 完整 OpenAI 兼容的 API URL
    model = '', // 模型名称
    key = '', // API Key
    nameExample = '', // 命名提示词
    fields = '', // 附加字段, 多个字段用逗号分隔
    cache = false, // 是否启用整体 AI 结果缓存
    ipCache = true, // 是否缓存 ip-api 查询结果
    ipApiFields = 'status,message,country,countryCode,region,city,isp,org,as,query',
    unknownIsp = 'UnknownISP',
  } = $arguments || {};

  const extraFields = fields
    .split(/,|，/g)
    .map((i) => i.trim())
    .filter((i) => i.length > 0);

  function getNodeHost(proxy = {}) {
    return (
      proxy.server ||
      proxy.address ||
      proxy.hostname ||
      proxy.host ||
      proxy.servername ||
      ''
    ).trim();
  }

  function isIpLikeOrDomain(host = '') {
    return /^[a-zA-Z0-9.-]+$/.test(host) && host.includes('.') && !host.includes('/');
  }

  function cacheKey(prefix, payload) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return `${prefix}:${ProxyUtils.hex_md5 ? ProxyUtils.hex_md5(str) : str}`;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function queryIpApi(host) {
    if (!host || !isIpLikeOrDomain(host)) {
      return { isp: unknownIsp };
    }

    const id = cacheKey('ip-api', { host, ipApiFields });
    if (ipCache) {
      const cached = scriptResourceCache.get(id);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch (e) {
          $.error(`ip-api 缓存解析失败: ${host} ${e.message}`);
        }
      }
    }

    const api = `http://ip-api.com/json/${encodeURIComponent(host)}?fields=${encodeURIComponent(ipApiFields)}`;
    const maxAttempts = Math.max(1, Number(ipRetry) + 1);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { statusCode, body } = await $.http.get({ timeout: ipApiTimeout, url: api });
        if (statusCode === 429 && attempt < maxAttempts) {
          $.error(`ip-api 触发限速: ${host} 状态码 429, 准备重试 ${attempt}/${maxAttempts - 1}`);
          await sleep(Math.max(1000, Number(ipBatchInterval) || 1500));
          continue;
        }
        if (statusCode !== 200) {
          $.error(`ip-api 查询失败: ${host} 状态码 ${statusCode}`);
          return { isp: unknownIsp };
        }
        const data = JSON.parse(body || '{}');
        if (data.status && data.status !== 'success') {
          $.error(`ip-api 查询失败: ${host} ${data.message || ''}`);
          return { isp: unknownIsp };
        }
        const result = {
          isp: data.isp || data.org || unknownIsp,
          as: data.as || '',
          countryCode: data.countryCode || '',
          country: data.country || '',
          region: data.region || '',
          city: data.city || '',
          query: data.query || host,
        };
        if (ipCache) {
          scriptResourceCache.set(id, JSON.stringify(result));
        }
        return result;
      } catch (e) {
        if (attempt < maxAttempts) {
          $.error(`ip-api 查询异常: ${host} ${e.message}, 准备重试 ${attempt}/${maxAttempts - 1}`);
          await sleep(Math.max(1000, Number(ipBatchInterval) || 1500));
          continue;
        }
        $.error(`ip-api 查询异常: ${host} ${e.message}`);
        return { isp: unknownIsp };
      }
    }

    return { isp: unknownIsp };
  }

  async function buildProxyInfo(p, i) {
    const host = getNodeHost(p);
    const ipInfo = await queryIpApi(host);
    const obj = {
      id: `${i}`,
      name: p.name,
      isp: ipInfo.isp || unknownIsp,
      as: ipInfo.as || '',
      countryCode: ipInfo.countryCode || '',
      city: ipInfo.city || '',
      query: ipInfo.query || host,
    };
    extraFields.forEach((field) => {
      if (p[field]) {
        obj[field] = p[field];
      }
    });
    return obj;
  }

  const proxyNamesArray = [];
  const batchSize = Math.max(1, Number(ipBatchSize) || 5);
  const batchInterval = Math.max(0, Number(ipBatchInterval) || 0);
  for (let start = 0; start < proxies.length; start += batchSize) {
    const batch = proxies.slice(start, start + batchSize);
    const infos = await Promise.all(
      batch.map((p, offset) => buildProxyInfo(p, start + offset)),
    );
    proxyNamesArray.push(...infos);
    if (start + batchSize < proxies.length && batchInterval > 0) {
      await sleep(batchInterval);
    }
  }

  const proxyNamesStr = JSON.stringify(proxyNamesArray);
  const content = `
你将收到一个 JSON 数组字符串。
每个对象可能包含 id、name、isp、as、countryCode、city、query 等字段。
其中 isp 来自 ip-api 查询结果，是该节点入口 IP/域名解析 IP 对应的服务商。

任务：
按照以下规则转换每个对象的 "name" 字段：
${nameExample}

输入：
${proxyNamesStr}

输出要求：
1. 只返回 JSON 数组字符串
2. 每个对象仅保留 "name" 和 "id" 字段
3. 不允许输出任何 JSON 之外的内容
4. 输出必须是合法 JSON，可被 JSON.parse 解析
5. 不要删除任何节点
6. 不要改变 id

输出示例格式：
[
  { "name": "...", "id": "..." },
  { "name": "...", "id": "..." }
]
`;

  let result = [];
  const cacheStr = JSON.stringify({ ...$arguments, content, proxyNamesStr });
  const cacheId = cacheKey('ai-rename', cacheStr);
  const cached = scriptResourceCache.get(cacheId);

  if (cache && cached) {
    $.info('使用缓存结果');
    result = JSON.parse(cached);
  } else {
    $.info('发送请求到 OpenAI 兼容接口...');
    const { statusCode, body } = await $.http.post({
      timeout,
      url,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      }),
    });

    $.info(`状态码: ${statusCode}`);
    $.info(`响应内容: ${body}`);
    result = JSON.parse(
      (JSON.parse(body)?.choices?.[0]?.message?.content || '[]')
        .replace(/^```json/i, '')
        .replace(/```$/, '')
        .trim(),
    );

    if (cache) {
      scriptResourceCache.set(cacheId, JSON.stringify(result));
    }
  }

  return result.map((item) => {
    const proxy = proxies.find((p, i) => item.id === `${i}`);
    return {
      ...proxy,
      name: item.name,
    };
  });
}
