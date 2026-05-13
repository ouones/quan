/**
 * AI 节点重命名脚本 + ip-api ISP 增强版（批量端点优化）
 *
 * 相比逐个查询版本：
 * - 使用 ip-api /batch 端点，单次 POST 最多 100 个 IP
 * - 50 个节点只需 1 次请求，不触发 45/min 限速
 * - 批量端点限速为 15 次/分钟
 *
 * 用法：
 * - url/model/key/nameExample 沿用原 AI 脚本参数
 * - 默认会读取节点 server/address/hostname，调用 ip-api 获取 isp/as/countryCode/city/query
 * - 发给 AI 的对象会包含：id、name、isp、as、countryCode、city、query，以及 fields 指定的字段
 */
async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const {
    timeout = 60000,          // OpenAI 兼容接口请求超时, 单位毫秒
    ipApiTimeout = 15000,     // ip-api 请求超时, 单位毫秒（批量请求放宽到 15s）
    ipBatchInterval = 4500,   // 批量重试之间的等待时间, 单位毫秒
    ipRetry = 2,              // ip-api 查询失败后的重试次数
    url = '',                 // 完整 OpenAI 兼容的 API URL
    model = '',               // 模型名称
    key = '',                 // API Key
    nameExample = '',         // 命名提示词
    fields = '',              // 附加字段, 多个字段用逗号分隔
    cache = false,            // 是否启用整体 AI 结果缓存
    ipCache = true,           // 是否缓存 ip-api 查询结果
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

  /**
   * 用 /batch 端点批量查询所有节点的 IP/域名信息
   * 单次 POST 最多 100 个 host，只占 1 次限额
   */
  function queryIpApiBatch(hosts) {
    // 去重，避免同一 host 重复查
    const unique = [...new Set(hosts)];
    const results = new Map(); // host -> ipInfo
    const batchSize = 100; // /batch 端点硬性上限

    const batches = [];
    for (let i = 0; i < unique.length; i += batchSize) {
      batches.push(unique.slice(i, i + batchSize));
    }

    const maxAttempts = Math.max(1, Number(ipRetry) + 1);

    return Promise.all(
      batches.map(async (batch, idx) => {
        $.info(`ip-api 批量查询第 ${idx + 1}/${batches.length} 批，共 ${batch.length} 个 host`);

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const { statusCode, body: resp } = await $.http.post({
              timeout: Number(ipApiTimeout) || 15000,
              url: 'http://ip-api.com/batch',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                batch.map((h) => ({ query: h, fields: ipApiFields }))
              ),
            });

            if (statusCode === 429) {
              if (attempt < maxAttempts) {
                $.error(`ip-api 批量触发限速 429，等待 ${ipBatchInterval}ms 后重试 ${attempt}/${maxAttempts - 1}`);
                await sleep(Number(ipBatchInterval) || 4500);
                continue;
              }
              $.error('ip-api 批量请求触发限速，本批跳过');
              break;
            }

            if (statusCode !== 200) {
              $.error(`ip-api 批量查询失败: 状态码 ${statusCode}`);
              if (attempt < maxAttempts) {
                await sleep(Number(ipBatchInterval) || 4500);
                continue;
              }
              break;
            }

            const items = JSON.parse(resp || '[]');
            for (const item of items) {
              const host = item.query || '';
              const info = item.status === 'success'
                ? {
                    isp: item.isp || item.org || unknownIsp,
                    as: item.as || '',
                    countryCode: item.countryCode || '',
                    country: item.country || '',
                    region: item.region || '',
                    city: item.city || '',
                    query: host,
                  }
                : { isp: unknownIsp, as: '', countryCode: '', country: '', region: '', city: '', query: host };
              results.set(host, info);
            }
            break; // 成功，跳出重试
          } catch (e) {
            if (attempt < maxAttempts) {
              $.error(`ip-api 批量查询异常: ${e.message}, 重试 ${attempt}/${maxAttempts - 1}`);
              await sleep(Number(ipBatchInterval) || 4500);
              continue;
            }
            $.error(`ip-api 批量查询异常: ${e.message}`);
          }
        }
      })
    ).then(() => results);
  }

  /**
   * 主入口：收集所有节点 host → 批量查 ip-api → 组装 proxyNamesArray
   */
  async function getProxyNamesArray() {
    // 1. 收集所有需要查询的 host
    const hostOfProxy = proxies.map((p) => getNodeHost(p));
    const hostsNeedingQuery = [];

    if (ipCache) {
      // 先查缓存，未命中的才加入查询队列
      for (const host of hostOfProxy) {
        if (!host || !isIpLikeOrDomain(host)) continue;
        const ck = cacheKey('ip-api-batch', { host, ipApiFields });
        const cached = scriptResourceCache.get(ck);
        if (cached) {
          try {
            JSON.parse(cached);
            continue; // 缓存有效，跳过
          } catch (_) {}
        }
        hostsNeedingQuery.push(host);
      }
    } else {
      // 不缓存模式，去重后全部查
      const seen = new Set();
      for (const host of hostOfProxy) {
        if (!host || !isIpLikeOrDomain(host)) continue;
        if (!seen.has(host)) {
          seen.add(host);
          hostsNeedingQuery.push(host);
        }
      }
    }

    // 2. 批量查询
    let results;
    if (hostsNeedingQuery.length > 0) {
      $.info(`开始批量查询 ip-api: ${hostsNeedingQuery.length} 个 host`);
      results = await queryIpApiBatch(hostsNeedingQuery);
      // 写缓存
      if (ipCache) {
        for (const [host, info] of results) {
          scriptResourceCache.set(cacheKey('ip-api-batch', { host, ipApiFields }), JSON.stringify(info));
        }
      }
    } else {
      results = new Map();
    }

    // 3. 组装结果（含缓存合并）
    return proxies.map((p, i) => {
      const host = getNodeHost(p);
      let ipInfo;

      if (host && isIpLikeOrDomain(host)) {
        ipInfo = results.get(host);
        // /batch 未查到（可能该 host 未命中查询），尝试从旧缓存读
        if (!ipInfo && ipCache) {
          const ck = cacheKey('ip-api-batch', { host, ipApiFields });
          const cached = scriptResourceCache.get(ck);
          if (cached) {
            try { ipInfo = JSON.parse(cached); } catch (_) {}
          }
        }
      }

      if (!ipInfo) {
        ipInfo = { isp: unknownIsp, as: '', countryCode: '', city: '', query: host || '' };
      }

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
        if (p[field]) obj[field] = p[field];
      });
      return obj;
    });
  }

  const proxyNamesArray = await getProxyNamesArray();
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
